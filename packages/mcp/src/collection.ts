/**
 * Filesystem discovery for .cv files. Pure listing + light metadata reads;
 * heavier per-file work (search, full extraction) lives in the callers.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspect, isCvFile, type CvMetadata } from '@cvfile/sdk';

/** Hard cap so a tool call pointed at a huge tree stays bounded. */
export const MAX_COLLECTION_FILES = 500;

export interface CvListing {
  file: string;
  metadata?: CvMetadata;
  error?: string;
}

export async function listCvFiles(directory: string, recursive = true): Promise<string[]> {
  const found: string[] = [];
  await walk(directory, recursive, found);
  return found.sort();
}

async function walk(dir: string, recursive: boolean, found: string[]): Promise<void> {
  if (found.length >= MAX_COLLECTION_FILES) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (found.length >= MAX_COLLECTION_FILES) return;
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) await walk(path, recursive, found);
    } else if (entry.name.toLowerCase().endsWith('.cv')) {
      found.push(path);
    }
  }
}

export async function describeCvFile(path: string): Promise<CvListing> {
  try {
    const bytes = await readFile(path);
    if (!(await isCvFile(bytes))) return { file: path, error: 'not a .cv file' };
    return { file: path, metadata: await inspect(bytes) };
  } catch (err) {
    return { file: path, error: err instanceof Error ? err.message : String(err) };
  }
}
