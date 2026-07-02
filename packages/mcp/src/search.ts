/**
 * Semantic search across a directory of .cv files. Each file carries its own
 * precomputed vectors (embeddings.cbor), so the corpus needs no index: we
 * detect which embedding model the corpus uses, embed the query once with a
 * backend for that model, and rank every chunk of every file against it.
 */

import { readFile } from 'node:fs/promises';
import { extractEmbeddingsParsed, extractMarkdown, type EmbeddingsPayload } from '@cvfile/sdk';
import { searchSemantic, type EmbeddingBackend } from '@cvfile/embed';
import { listCvFiles } from './collection.js';

export interface DirectorySearchOptions {
  directory: string;
  query: string;
  /** Resolve a query-embedding backend for the corpus's model. */
  backendFor: (model: string) => EmbeddingBackend;
  /** Force a specific embedding model instead of auto-detecting. */
  model?: string;
  k?: number;
  recursive?: boolean;
}

export interface DirectorySearchHit {
  file: string;
  score: number;
  chunkId: string;
  text: string;
}

export interface DirectorySearchResult {
  model: string;
  hits: DirectorySearchHit[];
  searchedFiles: number;
  /** Files without a usable embedding space for the query model. */
  skipped: { file: string; reason: string }[];
}

interface LoadedCv {
  file: string;
  payload: EmbeddingsPayload;
  markdown: string;
}

export async function searchDirectory(opts: DirectorySearchOptions): Promise<DirectorySearchResult> {
  const files = await listCvFiles(opts.directory, opts.recursive ?? true);
  const k = opts.k ?? 5;

  const loaded: LoadedCv[] = [];
  const skipped: { file: string; reason: string }[] = [];
  for (const file of files) {
    const outcome = await loadOneCv(file);
    if ('reason' in outcome) skipped.push({ file, reason: outcome.reason });
    else loaded.push(outcome);
  }

  const model = opts.model ?? dominantModel(loaded);
  if (!model) return { model: '', hits: [], searchedFiles: 0, skipped };

  const backend = opts.backendFor(model);
  const queryVector = (await backend.embed([opts.query])).vectors[0];
  if (!queryVector) throw new Error('Embedding backend returned no vector for the query');

  const hits: DirectorySearchHit[] = [];
  let searchedFiles = 0;
  for (const cv of loaded) {
    if (!cv.payload.spaces.some((s) => s.model === model)) {
      skipped.push({ file: cv.file, reason: `no embedding space for model ${model}` });
      continue;
    }
    searchedFiles += 1;
    for (const h of searchSemantic(cv.payload, queryVector, { model, k })) {
      hits.push({
        file: cv.file,
        score: h.score,
        chunkId: h.chunkId,
        text: cv.markdown.slice(h.textOffset, h.textOffset + h.textLength).trim(),
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return { model, hits: hits.slice(0, k), searchedFiles, skipped };
}

async function loadOneCv(file: string): Promise<LoadedCv | { reason: string }> {
  try {
    const bytes = await readFile(file);
    const payload = await extractEmbeddingsParsed(bytes);
    if (!payload || payload.spaces.length === 0) return { reason: 'no embeddings payload' };
    const markdown = (await extractMarkdown(bytes)) ?? '';
    return { file, payload, markdown };
  } catch (err) {
    return { reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Most common space model across the corpus; ties break toward first seen. */
function dominantModel(loaded: LoadedCv[]): string | undefined {
  const counts = new Map<string, number>();
  for (const cv of loaded) {
    for (const space of cv.payload.spaces) {
      counts.set(space.model, (counts.get(space.model) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [model, count] of counts) {
    if (count > bestCount) {
      best = model;
      bestCount = count;
    }
  }
  return best;
}
