import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { pack } from '@cvfile/sdk';
import { cvHandler } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));

async function makeDemoPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Jane Doe — Senior Software Engineer', { x: 50, y: 800, size: 18, font });
  return pdf.save();
}

async function main(): Promise<void> {
  const root = join(here, 'public');
  await mkdir(root, { recursive: true });

  const cv = await pack({
    pdf: await makeDemoPdf(),
    markdown: '# Jane Doe\n\nSenior software engineer.\n',
    html: '<!doctype html><html><body><h1>Jane Doe</h1></body></html>',
    metadata: { primaryLanguage: 'en' },
  });
  await writeFile(join(root, 'jane.cv'), cv);

  const handler = cvHandler({ root });
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(7373, resolve));
  console.log('Server up on http://localhost:7373/jane.cv');

  console.log('\n— PDF (default browser request) —');
  await dump(`http://localhost:7373/jane.cv`, { accept: 'text/html,*/*' });

  console.log('\n— Markdown (LLM crawler with Accept: text/markdown) —');
  await dump(`http://localhost:7373/jane.cv`, { accept: 'text/markdown' });

  console.log('\n— HTML extract —');
  await dump(`http://localhost:7373/jane.cv`, { accept: 'text/html' }, { showHead: true });

  console.log('\n— ?format=md query string wins —');
  await dump(`http://localhost:7373/jane.cv?format=md`, { accept: 'application/pdf' });

  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function dump(
  url: string,
  headers: Record<string, string>,
  opts: { showHead?: boolean } = {},
): Promise<void> {
  const res = await fetch(url, { headers });
  console.log(`  GET ${url}`);
  for (const [k, v] of Object.entries(headers)) console.log(`    > ${k}: ${v}`);
  console.log(`  ${res.status} ${res.statusText}`);
  console.log(`    < Content-Type: ${res.headers.get('content-type')}`);
  console.log(`    < Vary:         ${res.headers.get('vary')}`);
  console.log(`    < Link:         ${res.headers.get('link')?.slice(0, 110)}…`);
  const body = await res.text();
  if (opts.showHead) {
    console.log('  Body (first 80 chars):');
    console.log(`    ${body.slice(0, 80)}…`);
  } else {
    const head = body.startsWith('%PDF') ? '%PDF (binary, ' + body.length + ' bytes)' : body.slice(0, 80);
    console.log(`  Body: ${head}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
