import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const require = createRequire(import.meta.url);
import {
  extract,
  extractEmbeddingsParsed,
  extractMarkdown,
  inspect,
  isCvFile,
  pack,
  validate,
  type EmbeddingsPayload,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));

interface FontCandidate {
  regular: string;
  bold: string;
}

const SYSTEM_FONT_CANDIDATES: FontCandidate[] = [
  {
    regular: '/System/Library/Fonts/Supplemental/Arial.ttf',
    bold: '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  },
  {
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  },
  {
    regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  },
];

async function findSystemFontPair(): Promise<FontCandidate> {
  for (const candidate of SYSTEM_FONT_CANDIDATES) {
    try {
      await readFile(candidate.regular, { flag: 'r' });
      await readFile(candidate.bold, { flag: 'r' });
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(`No suitable TTF pair found. Install DejaVu or Liberation Sans.`);
}

async function buildSamplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const pair = await findSystemFontPair();
  const page = pdf.addPage([595, 842]);
  const regBytes = new Uint8Array(await readFile(pair.regular));
  const boldBytes = new Uint8Array(await readFile(pair.bold));
  const helv = await pdf.embedFont(regBytes, { subset: true });
  const helvBold = await pdf.embedFont(boldBytes, { subset: true });

  let y = 800;
  page.drawText('Jane Doe', { x: 50, y, size: 28, font: helvBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;
  page.drawText('Senior Software Engineer  ·  Paris, France', {
    x: 50,
    y,
    size: 12,
    font: helv,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 40;

  const sections: { title: string; lines: string[] }[] = [
    { title: 'Summary', lines: ['Backend engineer with 8 years building distributed systems at scale.'] },
    {
      title: 'Experience',
      lines: [
        'ACME Corp  ·  Staff Engineer  ·  2022 to present',
        '  Led the monolith to events migration; cut p99 from 1.2s to 180ms.',
        '',
        'Initech  ·  Senior Engineer  ·  2018 to 2022',
        '  Built the multi region storage layer for the document platform.',
      ],
    },
    {
      title: 'Skills',
      lines: ['Go, Python, TypeScript, Rust  ·  Kubernetes, Terraform, PostgreSQL, Kafka'],
    },
  ];

  for (const section of sections) {
    page.drawText(section.title, { x: 50, y, size: 16, font: helvBold });
    y -= 6;
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 16;
    for (const line of section.lines) {
      page.drawText(line, { x: 50, y, size: 11, font: helv, color: rgb(0.15, 0.15, 0.15) });
      y -= 16;
    }
    y -= 12;
  }

  return pdf.save();
}

async function main(): Promise<void> {
  const out = join(here, 'out');
  await mkdir(out, { recursive: true });

  console.log('1. Building sample PDF…');
  const pdfBytes = await buildSamplePdf();
  await writeFile(join(out, 'jane-doe.pdf'), pdfBytes);
  console.log(`   wrote ${out}/jane-doe.pdf (${pdfBytes.length} bytes)`);

  const md = await readFile(join(here, 'jane-doe.md'), 'utf8');
  const html = await readFile(join(here, 'jane-doe.html'), 'utf8');

  console.log('2. Packing into .cv (with placeholder BGE-M3 embeddings)…');
  const embeddings = makePlaceholderEmbeddings(md);
  const cv = await pack({
    pdf: pdfBytes,
    markdown: md,
    html,
    json: {
      basics: {
        name: 'Jane Doe',
        label: 'Senior Software Engineer',
        email: 'jane@example.com',
        location: { city: 'Paris', countryCode: 'FR' },
      },
    },
    embeddings,
    metadata: { primaryLanguage: 'en', generator: 'cv-examples/build-jane-doe' },
  });
  await writeFile(join(out, 'jane-doe.cv'), cv);
  console.log(`   wrote ${out}/jane-doe.cv (${cv.length} bytes)`);

  console.log('3. Verifying…');
  console.log(`   isCvFile        : ${await isCvFile(cv)}`);

  const meta = await inspect(cv);
  console.log(`   cv:version      : ${meta.version}`);
  console.log(`   primaryLanguage : ${meta.primaryLanguage}`);
  console.log(`   primaryPayload  : ${meta.primaryPayload}`);
  console.log(`   generator       : ${meta.generator}`);
  console.log(`   integrity items : ${meta.integrity.length}`);
  console.log(`   alternates      : ${meta.alternates.length}`);

  const file = await extract(cv);
  console.log(`   payloads        : ${file.payloads.map((p) => `${p.name}(${p.bytes.length}b)`).join(', ')}`);
  console.log(`   embeddings      : ${meta.embeddings.map((e) => `${e.model} dim=${e.dimension} chunks=${e.chunks}`).join(', ') || 'none'}`);

  const extractedMd = await extractMarkdown(cv);
  console.log(`   md round-trip   : ${extractedMd === md ? 'identical ✓' : 'DIFFERENT ✗'}`);

  const parsedEmb = await extractEmbeddingsParsed(cv);
  if (parsedEmb) {
    const space = parsedEmb.spaces[0]!;
    const head = Array.from(space.chunks[0]!.vector.slice(0, 3)).map((v) => v.toFixed(3)).join(', ');
    console.log(`   emb round-trip  : ${space.chunks.length} chunks recovered, first vector head: [${head}…]`);
  }

  const report = await validate(cv);
  console.log(`   validate        : ${report.ok ? 'ok ✓' : 'FAIL'} (${report.issues.length} issues)`);
  for (const issue of report.issues) {
    console.log(`     [${issue.level}] ${issue.code}: ${issue.message}`);
  }

  console.log('\nDone. Try opening jane-doe.cv in macOS Preview, Chrome, or Adobe Reader.');
  console.log(`open ${out}/jane-doe.cv`);
}

function makePlaceholderEmbeddings(markdown: string): EmbeddingsPayload {
  const sections = splitIntoSections(markdown);
  const dimension = 8;
  return {
    formatVersion: 1,
    spaces: [
      {
        model: 'BAAI/bge-m3',
        modelRevision: 'placeholder-revision',
        dimension,
        metric: 'cosine',
        normalized: true,
        chunking: 'section',
        chunks: sections.map((s, i) => ({
          id: s.id,
          textOffset: s.textOffset,
          textLength: s.textLength,
          vector: hashToVector(s.text, dimension, i),
        })),
      },
    ],
  };
}

function splitIntoSections(md: string): { id: string; textOffset: number; textLength: number; text: string }[] {
  const lines = md.split('\n');
  const sections: { id: string; textOffset: number; textLength: number; text: string }[] = [];
  let current: { id: string; start: number; lines: string[] } | null = null;
  let pos = 0;
  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (current) {
        const text = current.lines.join('\n');
        sections.push({
          id: current.id,
          textOffset: current.start,
          textLength: text.length,
          text,
        });
      }
      current = { id: slug(heading[1]!), start: pos, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
    pos += line.length + 1;
  }
  if (current) {
    const text = current.lines.join('\n');
    sections.push({
      id: current.id,
      textOffset: current.start,
      textLength: text.length,
      text,
    });
  }
  return sections.length > 0
    ? sections
    : [{ id: 'document', textOffset: 0, textLength: md.length, text: md }];
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function hashToVector(text: string, dim: number, salt: number): Float32Array {
  const out = new Float32Array(dim);
  let h = salt + 2654435761;
  for (let i = 0; i < text.length; i += 1) {
    h = ((h * 16777619) ^ text.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < dim; i += 1) {
    h = (h * 1664525 + 1013904223) >>> 0;
    out[i] = (h / 0xffffffff) * 2 - 1;
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
