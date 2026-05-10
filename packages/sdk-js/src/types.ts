export type AFRelationshipKind = 'Alternative' | 'Data' | 'Supplement';

export type BinaryInput = Uint8Array | ArrayBuffer | Blob;

export interface Payload {
  data: Uint8Array | string;
  name: string;
  mimeType: string;
  language?: string;
  relationship?: AFRelationshipKind;
  description?: string;
}

export interface AlternateMeta {
  payload: string;
  language: string;
  mimeType: string;
}

export interface IntegrityEntry {
  payload: string;
  algorithm: string;
  digest: string;
}

export interface EmbeddingSpaceSummary {
  model: string;
  dimension: number;
  metric: 'cosine' | 'dot' | 'euclidean';
  chunks: number;
}

export interface CvMetadata {
  version: string;
  primaryLanguage: string;
  primaryPayload: string;
  created?: Date;
  modified?: Date;
  generator?: string;
  alternates: AlternateMeta[];
  integrity: IntegrityEntry[];
  embeddings: EmbeddingSpaceSummary[];
}

export interface PackMetadataInput {
  primaryLanguage: string;
  primaryPayload?: string;
  created?: Date;
  modified?: Date;
  generator?: string;
  integrity?: 'sha-256' | 'none';
}

export interface PackInput {
  pdf: BinaryInput;
  markdown?: string | Uint8Array;
  html?: string | Uint8Array;
  json?: unknown;
  payloads?: Payload[];
  embeddings?: Uint8Array | import('./embeddings.js').EmbeddingsPayload;
  metadata: PackMetadataInput;
  pdfa?: boolean;
}

export interface ExtractedPayload {
  name: string;
  mimeType: string;
  language?: string;
  relationship: AFRelationshipKind;
  description?: string;
  bytes: Uint8Array;
  text(): string;
}

export interface CvFile {
  bytes: Uint8Array;
  metadata: CvMetadata;
  payloads: ExtractedPayload[];
}

export type ValidationLevel = 'cv-strict' | 'cv-lenient';

export interface ValidationIssue {
  code: string;
  level: 'error' | 'warning';
  message: string;
  payload?: string;
}

export interface ValidationReport {
  ok: boolean;
  level: ValidationLevel;
  issues: ValidationIssue[];
}
