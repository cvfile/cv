/**
 * transformers.js backend (browser + Node + Bun via @huggingface/transformers).
 *
 * Loads the model lazily and reuses the pipeline across calls. Models are
 * cached on disk by transformers.js itself (HF cache layout).
 */

import { pipeline, env } from '@huggingface/transformers';
import type { EmbeddingBackend, EmbeddingBackendOptions, EmbeddingMatrix } from './types.js';

interface TransformersBackendOptions extends EmbeddingBackendOptions {
  /** Override Xenova quantisation. Defaults to fp32 for closest fidelity. */
  dtype?: 'fp32' | 'fp16' | 'q8' | 'q4';
  /** Force a backend device (e.g. 'cpu', 'gpu', 'wasm'). Defaults to auto. */
  device?: 'cpu' | 'gpu' | 'wasm' | 'webgpu';
  /** Allow remote model downloads. true by default. */
  allowRemoteModels?: boolean;
}

export function createTransformersBackend(opts: TransformersBackendOptions): EmbeddingBackend {
  if (opts.allowRemoteModels === false) {
    env.allowRemoteModels = false;
  }

  let pipelinePromise: Promise<unknown> | null = null;
  let resolvedDimension: number | null = null;

  function getPipeline(): Promise<unknown> {
    if (!pipelinePromise) {
      const modelOpts: Record<string, unknown> = { dtype: opts.dtype ?? 'fp32' };
      if (opts.device !== undefined) modelOpts.device = opts.device;
      pipelinePromise = pipeline('feature-extraction', opts.model, modelOpts as never);
    }
    return pipelinePromise;
  }

  const backend: EmbeddingBackend = {
    model: opts.model,
    modelRevision: opts.modelRevision ?? 'main',
    metric: opts.metric ?? 'cosine',
    normalized: true,
    async embed(texts: string[]): Promise<EmbeddingMatrix> {
      if (texts.length === 0) {
        return { vectors: [], dimension: opts.dimension ?? 0 };
      }
      const pipe = (await getPipeline()) as (
        texts: string[],
        opts: { pooling: 'mean'; normalize: boolean },
      ) => Promise<{ data: Float32Array; dims: number[] }>;
      const tensor = await pipe(texts, { pooling: 'mean', normalize: true });
      const data = tensor.data;
      const dimension = tensor.dims[tensor.dims.length - 1] as number;
      if (resolvedDimension !== null && resolvedDimension !== dimension) {
        throw new Error(`Model emitted inconsistent dimension: had ${resolvedDimension}, now ${dimension}`);
      }
      resolvedDimension = dimension;
      const vectors: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += 1) {
        vectors.push(new Float32Array(data.buffer, data.byteOffset + i * dimension * 4, dimension).slice());
      }
      return { vectors, dimension };
    },
  };
  if (opts.dimension !== undefined) backend.dimension = opts.dimension;
  return backend;
}
