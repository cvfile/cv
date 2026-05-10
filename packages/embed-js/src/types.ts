import type { EmbeddingMetric } from '@cvfile/sdk';

export interface EmbeddingMatrix {
  vectors: Float32Array[];
  dimension: number;
}

export interface EmbeddingBackend {
  model: string;
  modelRevision: string;
  /** Optional pre-declared dimension; the backend may override after first call. */
  dimension?: number;
  metric: EmbeddingMetric;
  normalized: boolean;
  embed(texts: string[]): Promise<EmbeddingMatrix>;
}

export interface EmbeddingBackendOptions {
  model: string;
  modelRevision?: string;
  /** Optional pre-known dimension (e.g. 1024 for bge-m3). */
  dimension?: number;
  metric?: EmbeddingMetric;
}

/** Recommended default per spec §5: BAAI BGE-M3, MIT, multilingual, 1024-dim. */
export const DEFAULT_MODEL = 'Xenova/bge-m3';
export const DEFAULT_MODEL_DIMENSION = 1024;
