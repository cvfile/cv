import { CV_SPEC_VERSION, MAX_PAYLOAD_BYTES_DEFAULT } from './constants.js';
import { sha256Hex } from './digest.js';
import { toUint8Array } from './normalize.js';
import { PORTABLE_NAME_RE } from './pack.js';
import { checkPdfaConformance } from './pdfa.js';
import { loadDocument, readAssociatedFiles, readMetadataXml } from './pdf.js';
import { scanForbiddenConstructs } from './security.js';
import type { BinaryInput, PdfaConformance, ValidationIssue, ValidationLevel, ValidationReport } from './types.js';
import { parseXmp } from './xmp.js';

/** Default per-payload size cap, in bytes, per spec §7.3. */
export const DEFAULT_MAX_PAYLOAD_BYTES = MAX_PAYLOAD_BYTES_DEFAULT;

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

  let pdfDoc;
  try {
    pdfDoc = await loadDocument(bytes);
  } catch (err) {
    issues.push({ code: 'pdf-parse-failed', level: 'error', message: (err as Error).message });
    return { ok: false, level, issues };
  }

  // An /Encrypt trailer entry is authoritative; encrypted files carry encrypted
  // streams that cannot be meaningfully inspected, so reject immediately.
  if (pdfDoc.context.trailerInfo.Encrypt) {
    issues.push({
      code: 'encrypted-document',
      level: 'error',
      message: 'Document declares an /Encrypt dictionary; encryption is forbidden in cv 1.0 (spec §3.4)',
    });
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

  const newerVersionIssue = checkVersion(meta.version);
  if (newerVersionIssue) issues.push(newerVersionIssue);

  const payloads = readAssociatedFiles(pdfDoc, { maxPayloadBytes });
  if (payloads.length === 0) {
    issues.push({ code: 'no-payloads', level: 'error', message: 'No /AF Associated Files present' });
  }

  for (const payload of payloads) {
    if (payload.oversize) {
      issues.push({
        code: 'payload-too-large',
        level: 'error',
        message: `Payload "${payload.name}" exceeds the ${maxPayloadBytes}-byte cap (spec §7.3); decompression aborted`,
        payload: payload.name,
      });
    } else if (payload.bytes.length > maxPayloadBytes) {
      issues.push({
        code: 'payload-too-large',
        level: 'error',
        message: `Payload "${payload.name}" is ${payload.bytes.length} bytes; cap is ${maxPayloadBytes} (spec §7.3)`,
        payload: payload.name,
      });
    }
    if (!isPortableName(payload.name)) {
      issues.push({
        code: 'filename-not-portable',
        level: 'error',
        message: `Payload name "${payload.name}" is not POSIX-portable (spec §4.4)`,
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
    if (payload.oversize) {
      // Bytes were discarded when decompression hit the cap, so a digest
      // comparison would only add a misleading mismatch on top of the
      // payload-too-large error already reported above.
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

  let conformance: PdfaConformance | undefined;
  if (level === 'cv-strict') {
    const pdfa = checkPdfaConformance(pdfDoc, xml);
    conformance = pdfa.conformance;
    for (const issue of pdfa.issues) {
      issues.push(issue);
    }
  }

  const ok = issues.every((i) => i.level !== 'error');
  return conformance ? { ok, level, issues, conformance } : { ok, level, issues };
}

function isPortableName(name: string): boolean {
  if (!PORTABLE_NAME_RE.test(name)) return false;
  return name.split('/').every((segment) => segment !== '.' && segment !== '..');
}

/**
 * The highest cv MAJOR version this SDK fully understands. The 0.x pre-stable
 * series and the 1.x stable series are normatively identical (spec §12), so the
 * SDK knows both; a MAJOR of 2 or greater is "newer".
 */
const KNOWN_MAJOR = 1;

/**
 * Emit a "newer-format-version" warning when the file's cv:version MAJOR exceeds
 * what this SDK knows (spec §8.3). Both "0.1" and "1.0" are known; only a MAJOR
 * of 2 or greater warns. Extraction is never blocked: this is a warning only.
 */
function checkVersion(version: string): ValidationIssue | null {
  const major = parseMajor(version);
  if (major === null || major <= KNOWN_MAJOR) return null;
  return {
    code: 'newer-format-version',
    level: 'warning',
    message: `cv:version "${version}" has a newer MAJOR than this SDK knows (${CV_SPEC_VERSION}); rendering may be incomplete (spec §8.3)`,
  };
}

function parseMajor(version: string): number | null {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isNaN(major) ? null : major;
}
