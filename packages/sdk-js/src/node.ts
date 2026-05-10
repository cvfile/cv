import { readFile, writeFile } from 'node:fs/promises';
import { extract } from './extract.js';
import { pack } from './pack.js';
import type { CvFile, PackInput } from './types.js';

export async function packToFile(input: PackInput, path: string): Promise<void> {
  const bytes = await pack(input);
  await writeFile(path, bytes);
}

export async function extractFromFile(path: string): Promise<CvFile> {
  const bytes = await readFile(path);
  return extract(bytes);
}

export { pack, extract };
