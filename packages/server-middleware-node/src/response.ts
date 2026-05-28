import { createHash } from 'node:crypto';
import { buildLinkHeader, PDF_PRIMARY_MIME, type ServeFormat } from './conneg.js';
import { serveCv } from './serve.js';

export interface BuildResponseInput {
  bytes: Uint8Array;
  selfUrl: string;
  accept?: string | undefined;
  acceptLanguage?: string | undefined;
  formatQuery?: string | undefined;
  defaultFormat?: ServeFormat | undefined;
  cacheControl: string;
  lastModified?: Date | undefined;
  ifNoneMatch?: string | undefined;
  ifModifiedSince?: string | undefined;
}

export interface BuiltResponse {
  status: 200 | 304;
  headers: Record<string, string>;
  format: ServeFormat;
  body: Uint8Array;
}

/**
 * Negotiate the format and assemble the full set of response headers shared by
 * every adapter. The same URL yields a different body per negotiated format, so
 * the ETag is keyed on both the bytes and the format. Returns a 304 (empty body)
 * when the conditional request headers match.
 */
export async function buildCvResponse(input: BuildResponseInput): Promise<BuiltResponse> {
  const result = await serveCv({
    bytes: input.bytes,
    accept: input.accept,
    acceptLanguage: input.acceptLanguage,
    formatQuery: input.formatQuery,
    defaultFormat: input.defaultFormat,
  });

  const etag = computeETag(result.body, result.format);
  const lastModified = input.lastModified?.toUTCString();

  const headers: Record<string, string> = {
    'Content-Type': result.contentType,
    Vary: 'Accept, Accept-Language',
    Link: buildLinkHeader({ selfUrl: input.selfUrl, cvMime: PDF_PRIMARY_MIME }),
    'Cache-Control': input.cacheControl,
    ETag: etag,
    'Content-Disposition': contentDisposition(input.selfUrl, result.format),
  };
  if (result.language) {
    headers['Content-Language'] = result.language;
  }
  if (lastModified) {
    headers['Last-Modified'] = lastModified;
  }

  const notModified = isNotModified({
    etag,
    lastModified: input.lastModified,
    ifNoneMatch: input.ifNoneMatch,
    ifModifiedSince: input.ifModifiedSince,
  });
  if (notModified) {
    return { status: 304, headers, format: result.format, body: new Uint8Array(0) };
  }

  headers['Content-Length'] = String(result.body.length);
  return { status: 200, headers, format: result.format, body: result.body };
}

/** Weak ETag keyed on the negotiated body so each format gets a distinct tag. */
function computeETag(body: Uint8Array, format: ServeFormat): string {
  const hash = createHash('sha1').update(body).digest('base64url');
  return `W/"${format}-${body.length.toString(16)}-${hash}"`;
}

interface NotModifiedInput {
  etag: string;
  lastModified?: Date | undefined;
  ifNoneMatch?: string | undefined;
  ifModifiedSince?: string | undefined;
}

function isNotModified({ etag, lastModified, ifNoneMatch, ifModifiedSince }: NotModifiedInput): boolean {
  if (ifNoneMatch) {
    return etagMatches(ifNoneMatch, etag);
  }
  if (ifModifiedSince && lastModified) {
    const since = Date.parse(ifModifiedSince);
    if (!Number.isNaN(since)) {
      // Compare at second resolution, matching HTTP-date granularity.
      return Math.floor(lastModified.getTime() / 1000) <= Math.floor(since / 1000);
    }
  }
  return false;
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
  if (ifNoneMatch.trim() === '*') return true;
  const normalize = (tag: string): string => tag.trim().replace(/^W\//, '');
  const target = normalize(etag);
  return ifNoneMatch.split(',').some((candidate) => normalize(candidate) === target);
}

/**
 * Build a header-injection-safe Content-Disposition value. Control characters,
 * CR/LF, quotes and backslashes are stripped from the ASCII filename; non-ASCII
 * names also get an RFC 5987 filename* form.
 */
export function contentDisposition(selfUrl: string, format: ServeFormat): string {
  const filename = filenameForFormat(selfUrl, format);
  const asciiSafe = sanitizeAsciiFilename(filename);
  const base = `inline; filename="${asciiSafe}"`;
  if (!hasNonAscii(filename)) return base;
  return `${base}; filename*=UTF-8''${encodeRFC5987(filename)}`;
}

/**
 * Produce a safe quoted-string filename: drop control chars (CR/LF/DEL),
 * double quotes and backslashes; replace any remaining non-ASCII with '_'.
 */
function sanitizeAsciiFilename(filename: string): string {
  let out = '';
  for (const ch of filename) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue; // control chars incl. CR/LF
    if (ch === '"' || ch === '\\') continue; // quoted-string delimiters
    out += code > 0x7e ? '_' : ch; // collapse non-ASCII to underscore
  }
  return out || 'document';
}

function hasNonAscii(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code > 0x7e) return true;
  }
  return false;
}

function filenameForFormat(selfUrl: string, format: ServeFormat): string {
  const pathname = selfUrl.split('?')[0] ?? selfUrl;
  const base = decodeOrRaw(pathname.split('/').pop() ?? 'document');
  const stem = base.replace(/\.cv$/i, '').replace(/\.(pdf|md|html)$/i, '') || 'document';
  if (format === 'markdown') return `${stem}.md`;
  if (format === 'html') return `${stem}.html`;
  return `${stem}.cv`;
}

function decodeOrRaw(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
