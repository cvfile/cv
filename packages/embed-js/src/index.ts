export { embed, type EmbedOptions } from './embed.js';
export { searchSemantic, type SearchHit, type SearchOptions } from './search.js';
export { chunkMarkdown, type ChunkingMode, type MarkdownChunk } from './chunk.js';
export { createTransformersBackend } from './transformers-backend.js';
export { createHuggingFaceBackend, type HuggingFaceBackendOptions } from './huggingface-backend.js';
export {
  DEFAULT_MODEL,
  DEFAULT_MODEL_DIMENSION,
  type EmbeddingBackend,
  type EmbeddingBackendOptions,
  type EmbeddingMatrix,
} from './types.js';
