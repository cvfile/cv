import { sha256Hex } from './digest.js';
import { toUint8Array } from './normalize.js';
import { loadDocument, readAssociatedFiles, readMetadataXml } from './pdf.js';
import { scanForbiddenConstructs } from './security.js';
import type { BinaryInput, ValidationIssue, ValidationLevel, ValidationReport } from './types.js';
import { parseXmp } from './xmp.js';

/** Default per-payload size cap, in bytes, per spec §7.3. */
export const DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

export interface ValidateOptions {
  strict?: boolean;
  /** Per-payload decompressed-byte cap. Defaults to 16 MiB (spec §7.3). */
  maxPayloadBytes?: number;
}

export async function validate(input: BinaryInput, opts: ValidateOptions = {}): Promise<ValidationReport> {
  const level: ValidationLevel = opts.strict ? 'cv-strict' : 'cv-lenient';
  const maxPayloadBytes = opts.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const issues: ValidationIssue[] = [];
  const bytes = await toUint8Array(input);

  if (looksEncrypted(bytes)) {
    issues.push({
      code: 'encrypted-document',
      level: 'error',
      message: 'Trailer declares /Encrypt; encryption is forbidden in cv 0.x (spec §3.4)',
    });
    return { ok: false, level, issues };
  }

  let pdfDoc;
  try {
    pdfDoc = await loadDocument(bytes);
  } catch (err) {
    issues.push({ code: 'pdf-parse-failed', level: 'error', message: (err as Error).message });
    return { ok: false, level, issues };
  }

  for (const issue of scanForbiddenConstructs(pdfDoc)) {
    issues.push(issue);
  }

  const xml = readMetadataXml(pdfDoc);
  if (!xml) {
    issues.push({ code: 'no-xmp', level: 'error', message: 'Document catalog is missing /Metadata stream' });
    return { ok: false, level, issues };
  }

  const meta = parseXmp(xml);
  if (!meta) {
    issues.push({ code: 'xmp-missing-cv', level: 'error', message: 'XMP packet missing required cv: properties' });
    return { ok: false, level, issues };
  }

  const payloads = readAssociatedFiles(pdfDoc);
  if (payloads.length === 0) {
    issues.push({ code: 'no-payloads', level: 'error', message: 'No /AF Associated Files present' });
  }

  for (const payload of payloads) {
    if (payload.bytes.length > maxPayloadBytes) {
      issues.push({
        code: 'payload-too-large',
        level: 'error',
        message: `Payload "${payload.name}" is ${payload.bytes.length} bytes; cap is ${maxPayloadBytes} (spec §7.3)`,
        payload: payload.name,
      });
    }
  }

  if (!payloads.some((p) => p.name === meta.primaryPayload)) {
    issues.push({
      code: 'primary-missing',
      level: 'error',
      message: `cv:primaryPayload "${meta.primaryPayload}" not present in /AF`,
    });
  }

  for (const entry of meta.integrity) {
    const payload = payloads.find((p) => p.name === entry.payload);
    if (!payload) {
      issues.push({
        code: 'integrity-payload-missing',
        level: 'error',
        message: `Integrity entry references unknown payload "${entry.payload}"`,
        payload: entry.payload,
      });
      continue;
    }
    if (entry.algorithm === 'sha-256' || entry.algorithm === 'sha256') {
      const actual = await sha256Hex(payload.bytes);
      if (actual !== entry.digest.toLowerCase()) {
        issues.push({
          code: 'integrity-mismatch',
          level: 'error',
          message: `Integrity digest mismatch for "${entry.payload}"`,
          payload: entry.payload,
        });
      }
    } else {
      issues.push({
        code: 'integrity-unsupported-algo',
        level: 'warning',
        message: `Unsupported digest algorithm "${entry.algorithm}" for "${entry.payload}"`,
        payload: entry.payload,
      });
    }
  }

  if (level === 'cv-strict') {
    issues.push({
      code: 'pdfa3-not-checked',
      level: 'warning',
      message: 'cv-strict requires veraPDF PDF/A-3u conformance, which this SDK does not run in-process',
    });
  }

  const ok = issues.every((i) => i.level !== 'error');
  return { ok, level, issues };
}

/**
 * Byte-level pre-check for an /Encrypt trailer entry. pdf-lib refuses to
 * parse encrypted PDFs at load time, so without this the validator would
 * surface a generic parse failure instead of the documented spec-§3.4 code.
 */
function looksEncrypted(bytes: Uint8Array): boolean {
  // Search the last 4 KiB where the trailer lives.
  const tail = bytes.subarray(Math.max(0, bytes.length - 4096));
  const text = new TextDecoder('latin1').decode(tail);
  return /\/Encrypt\b/.test(text);
}
