/**
 * Backend selection for query/pack embedding. Explicit backend wins; a
 * Hugging Face token in the environment selects the hosted API (no model
 * download); otherwise the local transformers backend is used, which
 * downloads the model on first call.
 */

import { createHuggingFaceBackend, createTransformersBackend, DEFAULT_MODEL, type EmbeddingBackend } from '@cvfile/embed';

export interface BackendOptions {
  model?: string;
  backend?: EmbeddingBackend;
}

export function resolveBackend(opts: BackendOptions = {}): EmbeddingBackend {
  if (opts.backend) return opts.backend;
  const model = opts.model ?? DEFAULT_MODEL;
  if (process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN) {
    return createHuggingFaceBackend({ model });
  }
  return createTransformersBackend({ model });
}
