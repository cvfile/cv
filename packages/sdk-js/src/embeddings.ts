import { decode as cborDecode, encode as cborEncode } from 'cbor-x';

export type EmbeddingMetric = 'cosine' | 'dot' | 'euclidean';
export type EmbeddingChunking = 'document' | 'section' | 'paragraph';

export interface EmbeddingChunk {
  id: string;
  textOffset: number;
  textLength: number;
  vector: Float32Array;
}

export interface EmbeddingSpace {
  model: string;
  modelRevision: string;
  dimension: number;
  metric: EmbeddingMetric;
  normalized: boolean;
  chunking: EmbeddingChunking;
  chunks: EmbeddingChunk[];
}

export interface EmbeddingsPayload {
  formatVersion: number;
  spaces: EmbeddingSpace[];
}

const CURRENT_FORMAT_VERSION = 1;

interface CborChunk {
  id: string;
  'text-offset': number;
  'text-length': number;
  vector: Uint8Array;
}

interface CborSpace {
  model: string;
  'model-revision': string;
  dimension: number;
  metric: EmbeddingMetric;
  normalized: boolean;
  chunking: EmbeddingChunking;
  chunks: CborChunk[];
}

interface CborPayload {
  'format-version': number;
  spaces: CborSpace[];
}

export function encodeEmbeddings(payload: EmbeddingsPayload): Uint8Array {
  for (const space of payload.spaces) {
    validateSpace(space);
  }
  const cbor: CborPayload = {
    'format-version': payload.formatVersion ?? CURRENT_FORMAT_VERSION,
    spaces: payload.spaces.map(toCborSpace),
  };
  return cborEncode(cbor);
}

export function decodeEmbeddings(bytes: Uint8Array): EmbeddingsPayload {
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const decoded = cborDecode(view) as CborPayload;
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid embeddings payload: not a map');
  }
  const formatVersion = decoded['format-version'];
  if (typeof formatVersion !== 'number') {
    throw new Error('Invalid embeddings payload: missing format-version');
  }
  if (formatVersion > CURRENT_FORMAT_VERSION) {
    throw new Error(`Unsupported embeddings format version ${formatVersion} (this SDK supports up to ${CURRENT_FORMAT_VERSION})`);
  }
  if (!Array.isArray(decoded.spaces)) {
    throw new Error('Invalid embeddings payload: spaces is not an array');
  }
  return {
    formatVersion,
    spaces: decoded.spaces.map(fromCborSpace),
  };
}

function toCborSpace(space: EmbeddingSpace): CborSpace {
  return {
    model: space.model,
    'model-revision': space.modelRevision,
    dimension: space.dimension,
    metric: space.metric,
    normalized: space.normalized,
    chunking: space.chunking,
    chunks: space.chunks.map((c) => toCborChunk(c, space.dimension)),
  };
}

function fromCborSpace(raw: CborSpace): EmbeddingSpace {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid embedding space: not a map');
  }
  if (typeof raw.normalized !== 'boolean') {
    throw new Error(`Invalid embedding space "${raw.model}": normalized must be a boolean`);
  }
  if (!Array.isArray(raw.chunks)) {
    throw new Error(`Invalid embedding space "${raw.model}": chunks must be an array`);
  }
  // Mirror the encode-side guarantees (validateSpace) so attacker-supplied CBOR
  // cannot smuggle untyped model/metric/chunking/dimension values past readers.
  // Scalars are checked before decoding chunks so the dimension used for vector
  // length checks is known-valid.
  validateScalars({
    model: raw.model,
    modelRevision: raw['model-revision'],
    dimension: raw.dimension,
    metric: raw.metric,
    chunking: raw.chunking,
  });
  return {
    model: raw.model,
    modelRevision: raw['model-revision'],
    dimension: raw.dimension,
    metric: raw.metric,
    normalized: raw.normalized,
    chunking: raw.chunking,
    chunks: raw.chunks.map((c) => fromCborChunk(c, raw.dimension)),
  };
}

function toCborChunk(chunk: EmbeddingChunk, dimension: number): CborChunk {
  if (chunk.vector.length !== dimension) {
    throw new Error(
      `Chunk "${chunk.id}" vector length ${chunk.vector.length} does not match space dimension ${dimension}`,
    );
  }
  return {
    id: chunk.id,
    'text-offset': chunk.textOffset,
    'text-length': chunk.textLength,
    vector: float32ToBytes(chunk.vector),
  };
}

function fromCborChunk(raw: CborChunk, dimension: number): EmbeddingChunk {
  const vector = bytesToFloat32(raw.vector);
  if (vector.length !== dimension) {
    throw new Error(
      `Chunk "${raw.id}" vector length ${vector.length} does not match space dimension ${dimension}`,
    );
  }
  return {
    id: raw.id,
    textOffset: raw['text-offset'],
    textLength: raw['text-length'],
    vector,
  };
}

function validateSpace(space: EmbeddingSpace): void {
  validateScalars({
    model: space.model,
    modelRevision: space.modelRevision,
    dimension: space.dimension,
    metric: space.metric,
    chunking: space.chunking,
  });
  if (!Array.isArray(space.chunks) || space.chunks.length === 0) {
    throw new Error(`Embedding space "${space.model}" must contain at least one chunk`);
  }
}

interface SpaceScalars {
  model: unknown;
  modelRevision: unknown;
  dimension: unknown;
  metric: unknown;
  chunking: unknown;
}

/** Validates the scalar header fields shared by the encode and decode paths. */
function validateScalars(space: SpaceScalars): void {
  if (!space.model || typeof space.model !== 'string') throw new Error('Embedding space missing model');
  if (!space.modelRevision || typeof space.modelRevision !== 'string') {
    throw new Error(`Embedding space "${space.model}" missing modelRevision`);
  }
  if (!Number.isInteger(space.dimension) || (space.dimension as number) <= 0) {
    throw new Error(`Embedding space "${space.model}" dimension must be a positive integer`);
  }
  if (space.metric !== 'cosine' && space.metric !== 'dot' && space.metric !== 'euclidean') {
    throw new Error(`Embedding space "${space.model}" has invalid metric "${String(space.metric)}"`);
  }
  if (space.chunking !== 'document' && space.chunking !== 'section' && space.chunking !== 'paragraph') {
    throw new Error(`Embedding space "${space.model}" has invalid chunking "${String(space.chunking)}"`);
  }
}

function float32ToBytes(vec: Float32Array): Uint8Array {
  const view = new DataView(new ArrayBuffer(vec.length * 4));
  for (let i = 0; i < vec.length; i += 1) {
    view.setFloat32(i * 4, vec[i]!, true);
  }
  return new Uint8Array(view.buffer);
}

function bytesToFloat32(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 4 !== 0) {
    throw new Error('Vector byte length must be a multiple of 4');
  }
  const out = new Float32Array(bytes.byteLength / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = view.getFloat32(i * 4, true);
  }
  return out;
}

export function summarizeSpaces(payload: EmbeddingsPayload): { model: string; dimension: number; metric: EmbeddingMetric; chunks: number }[] {
  return payload.spaces.map((s) => ({
    model: s.model,
    dimension: s.dimension,
    metric: s.metric,
    chunks: s.chunks.length,
  }));
}
