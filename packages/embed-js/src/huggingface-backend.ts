/**
 * Hugging Face Inference API backend.
 *
 * Calls https://router.huggingface.co/hf-inference/models/<model>/pipeline/feature-extraction
 * with HF_TOKEN. For sentence-transformers models (BGE-M3, MiniLM, etc.) the
 * response is already mean-pooled per input — one vector per text. We
 * normalise client-side so cosine math is consistent across backends.
 */

import type { EmbeddingBackend, EmbeddingMatrix } from './types.js';
import type { EmbeddingMetric } from '@cvfile/sdk';

export interface HuggingFaceBackendOptions {
  model: string;
  /** HF token. Defaults to `process.env.HF_TOKEN`. */
  token?: string;
  /** Pinned revision; recorded in the payload. Default 'main'. */
  modelRevision?: string;
  /** Pre-known dimension. Optional; inferred from first response otherwise. */
  dimension?: number;
  metric?: EmbeddingMetric;
  /** Override base URL (e.g. for self-hosted TEI). */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://router.huggingface.co/hf-inference/models';

export function createHuggingFaceBackend(opts: HuggingFaceBackendOptions): EmbeddingBackend {
  const token = opts.token ?? process.env.HF_TOKEN ?? process.env.HUGGINGFACE_TOKEN;
  if (!token) {
    throw new Error('HF_TOKEN (or HUGGINGFACE_TOKEN) is required for the Hugging Face backend');
  }
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/${encodeURI(opts.model)}/pipeline/feature-extraction`;

  const backend: EmbeddingBackend = {
    model: opts.model,
    modelRevision: opts.modelRevision ?? 'main',
    metric: opts.metric ?? 'cosine',
    normalized: true,
    async embed(texts: string[]): Promise<EmbeddingMatrix> {
      if (texts.length === 0) {
        return { vectors: [], dimension: opts.dimension ?? 0 };
      }
      const body = JSON.stringify({ inputs: texts, options: { wait_for_model: true } });
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`HF Inference API ${res.status} for ${opts.model}: ${detail || res.statusText}`);
      }
      const raw = (await res.json()) as unknown;
      const matrix = parseHfResponse(raw, texts.length);
      const dimension = matrix[0]?.length ?? opts.dimension ?? 0;
      const vectors = matrix.map((v) => normalize(Float32Array.from(v)));
      return { vectors, dimension };
    },
  };
  if (opts.dimension !== undefined) backend.dimension = opts.dimension;
  return backend;
}

/**
 * Coerce the variety of shapes the HF Inference API returns into a flat
 * `number[][]`: one mean-pooled vector per input.
 *
 * Observed shapes:
 *   - sentence-transformers (BGE-M3, MiniLM): `[[...vec], [...vec]]`
 *   - feature-extraction without pooling: `[[[...token0], [...token1], ...], ...]`
 *   - single-input convenience form: `[...vec]`
 */
function parseHfResponse(raw: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(raw)) {
    throw new Error('HF Inference API: expected array response');
  }
  if (raw.length === 0) return [];

  const first = raw[0];
  if (typeof first === 'number') {
    if (expectedCount !== 1) {
      throw new Error(`HF Inference API: got 1 vector, expected ${expectedCount}`);
    }
    return [raw as number[]];
  }
  if (Array.isArray(first) && (first.length === 0 || typeof first[0] === 'number')) {
    return raw as number[][];
  }
  if (Array.isArray(first) && Array.isArray(first[0])) {
    // token-level embeddings: mean-pool per input
    return (raw as number[][][]).map(meanPool);
  }
  throw new Error('HF Inference API: unrecognised response shape');
}

function meanPool(tokens: number[][]): number[] {
  if (tokens.length === 0) return [];
  const dim = tokens[0]!.length;
  const out = new Array<number>(dim).fill(0);
  for (const t of tokens) {
    for (let i = 0; i < dim; i += 1) out[i]! += t[i]!;
  }
  for (let i = 0; i < dim; i += 1) out[i]! /= tokens.length;
  return out;
}

function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i += 1) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i += 1) v[i] = v[i]! / norm;
  return v;
}
