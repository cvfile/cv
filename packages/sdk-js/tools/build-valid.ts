/**
 * Builds the valid/boundary-corpus fixtures consumed by the SDK vector tests.
 *
 * Complements tools/build-malicious.ts: where the malicious corpus proves a
 * reader rejects forbidden constructs, this corpus proves it accepts
 * conforming files, round-trips their payloads, and reports the documented
 * outcome on boundary cases (tampered integrity, oversized payload, newer
 * MAJOR version, missing cv: XMP). The manifest pairs each fixture with the
 * outcome every conforming implementation must produce.
 *
 * Fixtures are built through the SDK's own pack(), then mutated at the PDF
 * object level where a conforming packer refuses to produce the construct
 * (build-malicious.ts uses the same technique). Dates and generator strings
 * are pinned for reproducibility; the PDF/A trailer /ID is randomised by
 * pack() and is intentionally left alone (it carries no cv: semantics).
 *
 * A "bad filename" vector is deliberately absent: the packer can be bypassed
 * to emit one (see fixes.test.ts), but only the JS SDK implements the
 * filename-not-portable read-side check today, so a shared vector would
 * document an expectation two of the three reference SDKs do not meet.
 *
 * Run with `pnpm dlx tsx tools/build-valid.ts`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFArray, PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import type { EmbeddingsPayload } from '../src/embeddings.js';
import { pack } from '../src/pack.js';
import { loadDocument, readMetadataXml, setMetadataXml } from '../src/pdf.js';
import { DEFAULT_MAX_PAYLOAD_BYTES, validate } from '../src/validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const sdkRoot = join(here, '..');
const repoRoot = join(sdkRoot, '..', '..');
const outDir = join(repoRoot, 'spec', 'test-vectors', 'valid');

/** Pinned so repeated builds produce identical XMP dates. */
const CREATED = new Date('2026-01-15T12:00:00Z');
const GENERATOR = 'cvfile-test-vectors 1.0';

const MINIMAL_MD = `# Ada Lovelace

Analyst and programmer, London.

## Experience

* Analytical Engine collaboration with Charles Babbage
* Published the first algorithm intended for a machine (1843)
`;

const FULL_MD = `# Grace Hopper

Computer scientist and United States Navy rear admiral.

## Experience

* Invented the first compiler (A-0)
* Co-designed COBOL
`;

const FULL_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Grace Hopper</title></head>
<body><h1>Grace Hopper</h1><p>Computer scientist and United States Navy rear admiral.</p></body></html>`;

const FULL_JSON = {
  basics: {
    name: 'Grace Hopper',
    label: 'Computer scientist',
  },
};

const FR_MD = `# Camille Martin

Ingénieure logiciel à Paris.

## Expérience

* Conception de systèmes distribués
* Encadrement technique
`;

const EN_MD = `# Camille Martin

Software engineer in Paris.

## Experience

* Distributed systems design
* Technical leadership
`;

/**
 * Tiny deterministic embedding space: 2 chunks over an 8-dim space, vectors
 * are unit basis vectors so they are exactly representable in float32 and
 * genuinely normalized. No model download, no network, no randomness.
 */
function fakeEmbeddings(): EmbeddingsPayload {
  const dimension = 8;
  const basis = (i: number): Float32Array => {
    const v = new Float32Array(dimension);
    v[i] = 1;
    return v;
  };
  return {
    formatVersion: 1,
    spaces: [
      {
        model: 'test/fake-model',
        modelRevision: 'v1',
        dimension,
        metric: 'cosine',
        normalized: true,
        chunking: 'section',
        chunks: [
          { id: 'c0', textOffset: 0, textLength: 16, vector: basis(0) },
          { id: 'c1', textOffset: 16, textLength: 32, vector: basis(1) },
        ],
      },
    ],
  };
}

async function basePdf(title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(title, { x: 72, y: 720, size: 18, font });
  return doc.save();
}

interface FixtureEntry {
  filename: string;
  expected: 'valid' | 'warning' | 'error';
  expectedCode?: string;
  description: string;
  primaryPayload?: string;
  primaryLanguage?: string;
  payloadNames?: string[];
}

interface Fixture extends FixtureEntry {
  build: () => Promise<Uint8Array>;
}

const fixtures: Fixture[] = [
  {
    filename: 'minimal.cv',
    expected: 'valid',
    description: 'Minimal conforming cv-lenient file: one page of PDF plus a markdown payload.',
    primaryPayload: 'resume.md',
    primaryLanguage: 'en',
    payloadNames: ['resume.md'],
    build: async () =>
      pack({
        pdf: await basePdf('Ada Lovelace'),
        markdown: MINIMAL_MD,
        metadata: { primaryLanguage: 'en', created: CREATED, generator: GENERATOR },
      }),
  },
  {
    filename: 'full.cv',
    expected: 'valid',
    description:
      'All four payloads: markdown, HTML, JSON Resume, and an embeddings.cbor with a tiny deterministic fake ' +
      'space (2 chunks, dimension 8, model "test/fake-model"). Canonical embeddings.cbor example.',
    primaryPayload: 'resume.md',
    primaryLanguage: 'en',
    payloadNames: ['resume.md', 'resume.html', 'resume.json', 'embeddings.cbor'],
    build: async () =>
      pack({
        pdf: await basePdf('Grace Hopper'),
        markdown: FULL_MD,
        html: FULL_HTML,
        json: FULL_JSON,
        embeddings: fakeEmbeddings(),
        metadata: { primaryLanguage: 'en', created: CREATED, generator: GENERATOR },
      }),
  },
  {
    filename: 'multilingual.cv',
    expected: 'valid',
    description: 'Primary language fr with an English alternate markdown payload declared in cv:alternates.',
    primaryPayload: 'resume.md',
    primaryLanguage: 'fr',
    payloadNames: ['resume.md', 'resume.en.md'],
    build: async () =>
      pack({
        pdf: await basePdf('Camille Martin'),
        markdown: FR_MD,
        payloads: [
          {
            data: EN_MD,
            name: 'resume.en.md',
            mimeType: 'text/markdown',
            language: 'en',
            relationship: 'Alternative',
            description: 'English alternate',
          },
        ],
        metadata: { primaryLanguage: 'fr', created: CREATED, generator: GENERATOR },
      }),
  },
  {
    filename: 'integrity-mismatch.cv',
    expected: 'error',
    expectedCode: 'integrity-mismatch',
    description:
      'Valid file whose resume.md payload bytes were replaced after packing; the cv:integrity sha-256 digest ' +
      'no longer matches the payload.',
    build: async () => {
      const cv = await pack({
        pdf: await basePdf('Ada Lovelace'),
        markdown: MINIMAL_MD,
        metadata: { primaryLanguage: 'en', created: CREATED, generator: GENERATOR },
      });
      return tamperPayload(cv, 'resume.md', '# Mallory\n\nTampered after packing.\n');
    },
  },
  {
    filename: 'oversized-payload.cv',
    expected: 'error',
    expectedCode: 'payload-too-large',
    description:
      'The markdown payload inflates past the 16 MiB per-payload cap (spec §7.3) but FlateDecode-compresses ' +
      'to a few kilobytes on disk. Validators must report payload-too-large; capped extractors must refuse to ' +
      'expand it by default.',
    build: async () =>
      pack({
        pdf: await basePdf('Big File'),
        markdown: '# Big\n\n' + 'x'.repeat(DEFAULT_MAX_PAYLOAD_BYTES + 1),
        metadata: { primaryLanguage: 'en', created: CREATED, generator: GENERATOR },
      }),
  },
  {
    filename: 'future-major.cv',
    expected: 'warning',
    expectedCode: 'newer-format-version',
    description:
      'cv:version declares "2.0". Per spec §8.3 a consumer MUST surface a newer-format-version warning, ' +
      'SHOULD still render the PDF, and MUST NOT drop payloads from extraction; validation stays ok.',
    primaryPayload: 'resume.md',
    primaryLanguage: 'en',
    payloadNames: ['resume.md'],
    build: async () => {
      const cv = await pack({
        pdf: await basePdf('Ada Lovelace'),
        markdown: MINIMAL_MD,
        metadata: { primaryLanguage: 'en', created: CREATED, generator: GENERATOR },
      });
      const doc = await loadDocument(cv);
      const xml = readMetadataXml(doc);
      if (!xml) throw new Error('packed file lost its XMP metadata');
      const bumped = xml.replace('<cv:version>1.0</cv:version>', '<cv:version>2.0</cv:version>');
      if (bumped === xml) throw new Error('cv:version 1.0 not found in XMP');
      setMetadataXml(doc, bumped);
      return doc.save({ useObjectStreams: false });
    },
  },
  {
    filename: 'missing-xmp.cv',
    expected: 'error',
    expectedCode: 'xmp-missing-cv',
    description:
      'PDF with /AF attachments and an XMP packet, but the packet carries none of the required cv: ' +
      'properties (spec §6.2).',
    build: async () => {
      const cv = await pack({
        pdf: await basePdf('Ada Lovelace'),
        markdown: MINIMAL_MD,
        metadata: { primaryLanguage: 'en', created: CREATED, generator: GENERATOR },
      });
      const doc = await loadDocument(cv);
      setMetadataXml(doc, xmpWithoutCvProperties());
      return doc.save({ useObjectStreams: false });
    },
  },
];

/**
 * Replace the embedded-file stream of the named payload with new content,
 * leaving the XMP integrity digest (and the /Params /CheckSum) stale. This is
 * the same post-pack object-level surgery build-malicious.ts performs.
 */
async function tamperPayload(cv: Uint8Array, payloadName: string, newContent: string): Promise<Uint8Array> {
  const doc = await loadDocument(cv);
  const afArray = doc.context.lookup(doc.catalog.get(PDFName.of('AF')), PDFArray);

  for (let i = 0; i < afArray.size(); i += 1) {
    const filespec = doc.context.lookup(afArray.get(i), PDFDict);
    const name = filespec.lookup(PDFName.of('UF')) ?? filespec.lookup(PDFName.of('F'));
    const decoded = name && 'decodeText' in name ? (name as { decodeText(): string }).decodeText() : undefined;
    if (decoded !== payloadName) continue;

    const tampered = doc.context.flateStream(new TextEncoder().encode(newContent), {
      Type: 'EmbeddedFile',
      Subtype: 'text/markdown',
    });
    const tamperedRef = doc.context.register(tampered);
    const efDict = doc.context.lookup(filespec.get(PDFName.of('EF')), PDFDict);
    efDict.set(PDFName.of('F'), tamperedRef);
    efDict.set(PDFName.of('UF'), tamperedRef);
    return doc.save({ useObjectStreams: false });
  }
  throw new Error(`payload "${payloadName}" not found in /AF`);
}

/** A well-formed XMP packet that simply lacks every cv: property. */
function xmpWithoutCvProperties(): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="cvfile-test-vectors">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>${GENERATOR}</xmp:CreatorTool>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Fail the build immediately if a fixture does not produce its documented outcome. */
async function selfCheck(fixture: Fixture, bytes: Uint8Array): Promise<void> {
  const report = await validate(bytes);
  const codes = report.issues.map((i) => i.code);
  if (fixture.expected === 'error') {
    if (report.ok || !codes.includes(fixture.expectedCode!)) {
      throw new Error(`${fixture.filename}: expected error "${fixture.expectedCode}", got ok=${report.ok} [${codes.join(', ')}]`);
    }
    return;
  }
  if (!report.ok) {
    throw new Error(`${fixture.filename}: expected ok, got issues [${codes.join(', ')}]`);
  }
  if (fixture.expected === 'warning' && !codes.includes(fixture.expectedCode!)) {
    throw new Error(`${fixture.filename}: expected warning "${fixture.expectedCode}", got [${codes.join(', ')}]`);
  }
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const manifestEntries: FixtureEntry[] = [];
  for (const fixture of fixtures) {
    const bytes = await fixture.build();
    await selfCheck(fixture, bytes);
    await writeFile(join(outDir, fixture.filename), bytes);

    const entry: FixtureEntry = {
      filename: fixture.filename,
      expected: fixture.expected,
      description: fixture.description,
    };
    if (fixture.expectedCode) entry.expectedCode = fixture.expectedCode;
    if (fixture.primaryPayload) entry.primaryPayload = fixture.primaryPayload;
    if (fixture.primaryLanguage) entry.primaryLanguage = fixture.primaryLanguage;
    if (fixture.payloadNames) entry.payloadNames = fixture.payloadNames;
    manifestEntries.push(entry);
    process.stdout.write(`wrote ${fixture.filename} (${bytes.length} bytes)\n`);
  }

  const manifest = {
    note:
      'Positive and boundary vectors. "expected": "valid" fixtures must validate ok and extract losslessly; ' +
      '"warning" fixtures must validate ok while surfacing expectedCode as a warning without blocking ' +
      'extraction; "error" fixtures must fail validation with expectedCode among the issues.',
    fixtures: manifestEntries,
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(`wrote manifest.json (${manifestEntries.length} fixtures)\n`);
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
