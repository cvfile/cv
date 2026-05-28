import { CV_SPEC_VERSION } from './constants.js';
import { sha256Hex } from './digest.js';
import { toUint8Array } from './normalize.js';
import { PORTABLE_NAME_RE } from './pack.js';
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
      message: 'Document declares an /Encrypt dictionary; encryption is forbidden in cv 0.x (spec §3.4)',
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
