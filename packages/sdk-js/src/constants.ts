export const CV_SPEC_VERSION = '0.1';

export const CV_NAMESPACE_URI = 'http://ns.cvfile.org/cv/1.0/';
export const CV_NAMESPACE_PREFIX = 'cv';

export const DEFAULT_GENERATOR = `@cvfile/sdk/${CV_SPEC_VERSION}`;

export const DEFAULT_PAYLOAD_NAMES = {
  markdown: 'resume.md',
  html: 'resume.html',
  json: 'resume.json',
  embeddings: 'embeddings.cbor',
} as const;

export const PAYLOAD_MIME_TYPES = {
  markdown: 'text/markdown',
  html: 'text/html',
  json: 'application/json',
  embeddings: 'application/vnd.cv.embeddings+cbor',
  pdf: 'application/pdf',
  cv: 'application/vnd.cv+pdf',
} as const;

export const MAX_PAYLOAD_BYTES_DEFAULT = 16 * 1024 * 1024;
