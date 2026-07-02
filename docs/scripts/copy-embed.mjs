/**
 * Copies the self-contained viewer CDN bundle into the docs public tree so it
 * ships at https://cvfile.org/embed/1/cv-embed.js. Runs as part of the docs
 * build; the Vercel build command builds @cvfile/viewer-web first, so the
 * source bundle is guaranteed to exist. Fails loudly otherwise: a docs deploy
 * without the embed script would break the public install snippet.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', 'packages', 'viewer-web', 'dist', 'cdn', 'cv-embed.js');
const targetDir = join(here, '..', 'public', 'embed', '1');
const target = join(targetDir, 'cv-embed.js');

try {
  await stat(source);
} catch {
  console.error(`copy-embed: source bundle missing: ${source}`);
  console.error('copy-embed: build @cvfile/viewer-web first (pnpm --filter @cvfile/viewer-web build)');
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });
await copyFile(source, target);
console.log(`copy-embed: copied ${source} -> ${target}`);
