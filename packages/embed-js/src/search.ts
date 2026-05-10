/**
 * Pure similarity search over an EmbeddingsPayload. Vector input is the
 * caller's responsibility (encode the query with the same model that was
 * used to populate the space, ideally pulled from space.model).
 */

import type { EmbeddingMetric, EmbeddingSpace, EmbeddingsPayload } from '@cvfile/sdk';

export interface SearchHit {
  spaceModel: string;
  chunkId: string;
  textOffset: number;
  textLength: number;
  score: number;
}

export interface SearchOptions {
  /** Restrict to a specific embedding space; default = first space. */
  model?: string;
  /** Top-k results; default 5. */
  k?: number;
}

export function searchSemantic(
  payload: EmbeddingsPayload,
  queryVector: Float32Array,
  opts: SearchOptions = {},
): SearchHit[] {
  const space = pickSpace(payload, opts.model);
  if (!space) throw new Error('No matching embedding space found');
  if (queryVector.length !== space.dimension) {
    throw new Error(`Query vector dimension ${queryVector.length} does not match space ${space.model} (${space.dimension})`);
  }

  const k = opts.k ?? 5;
  const scored: SearchHit[] = space.chunks.map((c) => ({
    spaceModel: space.model,
    chunkId: c.id,
    textOffset: c.textOffset,
    textLength: c.textLength,
    score: similarity(queryVector, c.vector, space.metric),
  }));

  // Higher score = better for cosine/dot; lower for euclidean.
  const order = space.metric === 'euclidean' ? 1 : -1;
  scored.sort((a, b) => order * (a.score - b.score));
  return scored.slice(0, k);
}

function pickSpace(payload: EmbeddingsPayload, modelHint?: string): EmbeddingSpace | undefined {
  if (modelHint) return payload.spaces.find((s) => s.model === modelHint);
  return payload.spaces[0];
}

function similarity(a: Float32Array, b: Float32Array, metric: EmbeddingMetric): number {
  if (metric === 'euclidean') {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) {
      const d = a[i]! - b[i]!;
      sum += d * d;
    }
    return Math.sqrt(sum);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i]! * b[i]!;
  if (metric === 'dot') return dot;
  // cosine: assume normalized vectors when produced by our backend
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
