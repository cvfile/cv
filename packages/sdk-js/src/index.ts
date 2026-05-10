export { pack } from './pack.js';
export { extract, extractMarkdown, extractHtml, extractEmbeddings, extractEmbeddingsParsed } from './extract.js';
export { inspect } from './inspect.js';
export { validate } from './validate.js';
export { isCvFile } from './detect.js';
export {
  encodeEmbeddings,
  decodeEmbeddings,
  summarizeSpaces,
  type EmbeddingChunk,
  type EmbeddingChunking,
  type EmbeddingMetric,
  type EmbeddingSpace,
  type EmbeddingsPayload,
} from './embeddings.js';

export {
  CV_SPEC_VERSION,
  CV_NAMESPACE_URI,
  CV_NAMESPACE_PREFIX,
  DEFAULT_PAYLOAD_NAMES,
  PAYLOAD_MIME_TYPES,
} from './constants.js';

export type {
  AFRelationshipKind,
  AlternateMeta,
  BinaryInput,
  CvFile,
  CvMetadata,
  EmbeddingSpaceSummary,
  ExtractedPayload,
  IntegrityEntry,
  PackInput,
  PackMetadataInput,
  Payload,
  ValidationIssue,
  ValidationLevel,
  ValidationReport,
} from './types.js';
