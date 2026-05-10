/**
 * High-level embed() API: markdown in, EmbeddingsPayload out, ready to drop
 * into pack({ embeddings: ... }).
 */

import type { EmbeddingChunk, EmbeddingSpace, EmbeddingsPayload } from '@cvfile/sdk';
import { chunkMarkdown, type ChunkingMode } from './chunk.js';
import { createTransformersBackend } from './transformers-backend.js';
import { DEFAULT_MODEL, type EmbeddingBackend } from './types.js';

export interface EmbedOptions {
  /** HF model id; defaults to BGE-M3 (Xenova/bge-m3). */
  model?: string;
  /** Pinned model revision; recorded in the payload for reproducibility. */
  modelRevision?: string;
  /** Chunking strategy; default 'section'. */
  chunking?: ChunkingMode;
  /** Bring-your-own backend (e.g. an OpenAI/Voyage adapter). */
  backend?: EmbeddingBackend;
}

export async function embed(markdown: string, opts: EmbedOptions = {}): Promise<EmbeddingsPayload> {
  const chunks = chunkMarkdown(markdown, { mode: opts.chunking ?? 'section' });
  const backend =
    opts.backend ??
    createTransformersBackend(
      opts.modelRevision !== undefined
        ? { model: opts.model ?? DEFAULT_MODEL, modelRevision: opts.modelRevision }
        : { model: opts.model ?? DEFAULT_MODEL },
    );

  const matrix = await backend.embed(chunks.map((c) => c.text));
  if (matrix.vectors.length !== chunks.length) {
    throw new Error(`Backend returned ${matrix.vectors.length} vectors for ${chunks.length} chunks`);
  }

  const embeddingChunks: EmbeddingChunk[] = chunks.map((c, i) => ({
    id: c.id,
    textOffset: c.textOffset,
    textLength: c.textLength,
    vector: matrix.vectors[i]!,
  }));

  const space: EmbeddingSpace = {
    model: backend.model,
    modelRevision: backend.modelRevision,
    dimension: matrix.dimension,
    metric: backend.metric,
    normalized: backend.normalized,
    chunking: opts.chunking ?? 'section',
    chunks: embeddingChunks,
  };

  return { formatVersion: 1, spaces: [space] };
}
