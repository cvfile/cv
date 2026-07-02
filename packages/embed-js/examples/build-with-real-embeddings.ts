/**
 * Builds a .cv with real BGE-M3 embeddings via the HF Inference API.
 * Used as the fixture for `cv search`.
 *
 * Usage: HF_TOKEN=hf_xxx pnpm --filter @cvfile/embed exec tsx examples/build-with-real-embeddings.ts
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from '@cvfile/sdk';
import { embed } from '../src/embed.js';
import { createHuggingFaceBackend } from '../src/huggingface-backend.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const sdkExamples = join(repoRoot, 'packages', 'sdk-js', 'examples');
const outDir = join(here, 'out');

async function main(): Promise<void> {
  const md = await readFile(join(sdkExamples, 'jane-doe.md'), 'utf8');
  const html = await readFile(join(sdkExamples, 'jane-doe.html'), 'utf8');
  const pdfBytes = await readFile(join(sdkExamples, 'out', 'jane-doe.pdf'));

  process.stdout.write('embedding markdown with BAAI/bge-m3 via HF Inference API…\n');
  const payload = await embed(md, {
    backend: createHuggingFaceBackend({ model: 'BAAI/bge-m3', dimension: 1024 }),
  });
  process.stdout.write(`  ${payload.spaces[0]?.chunks.length} chunks, ${payload.spaces[0]?.dimension}-dim\n`);

  // Pass the parsed payload (not pre-encoded bytes) so pack() can emit the
  // cv:embeddings space summaries into the XMP metadata.
  const cvBytes = await pack({
    pdf: pdfBytes,
    markdown: md,
    html,
    embeddings: payload,
    metadata: {
      primaryLanguage: 'en',
      primaryPayload: 'resume.md',
      generator: 'cv-embed-real-bge-m3',
      integrity: 'sha-256',
    },
  });

  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'jane-doe-with-bge-m3.cv');
  await writeFile(outPath, cvBytes);
  process.stdout.write(`wrote ${outPath} (${cvBytes.length} bytes)\n`);
}

main().catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
