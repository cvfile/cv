import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject } from 'pdf-lib';
import type { ValidationIssue } from './types.js';

/**
 * In-process PDF/A-3u structural conformance check.
 *
 * This is NOT a full ISO 19005-3 validator: that is what veraPDF is for, and the
 * CLI / CI run it as the authoritative gate. What this DOES do is verify the
 * load-bearing requirements that actually fail in practice when a real-world PDF
 * (Word, Google Docs, Canva, "Print to PDF") is wrapped into a `.cv`, so the SDK
 * can give an honest verdict in environments where veraPDF cannot run (the
 * browser `/create/` flow above all). The cardinal rule: never report a clean
 * strict pass for a file we can prove is non-conformant.
 *
 * Verdicts:
 *   - 'failed'         a hard PDF/A-3u violation was found (errors emitted)
 *   - 'structural-pass' every requirement we can check in-process holds; full
 *                       ISO 19005-3 conformance still needs veraPDF (one warning)
 */
export type PdfaConformance = 'failed' | 'structural-pass';

export interface PdfaCheckResult {
  conformance: PdfaConformance;
  issues: ValidationIssue[];
}

const TYPE = PDFName.of('Type');
const SUBTYPE = PDFName.of('Subtype');
const FONT = PDFName.of('Font');
const FONT_DESCRIPTOR = PDFName.of('FontDescriptor');
const DESCENDANT_FONTS = PDFName.of('DescendantFonts');
const BASE_FONT = PDFName.of('BaseFont');
const OUTPUT_INTENTS = PDFName.of('OutputIntents');
const S_KEY = PDFName.of('S');
const DEST_OUTPUT_PROFILE = PDFName.of('DestOutputProfile');

const FONT_FILE_KEYS = [PDFName.of('FontFile'), PDFName.of('FontFile2'), PDFName.of('FontFile3')];

/**
 * Run the structural PDF/A-3u checks. `xmpXml` is the document's XMP packet,
 * needed for the PDF/A identification markers (pdfaid:part / pdfaid:conformance)
 * which live only in metadata, not the object graph.
 */
export function checkPdfaConformance(pdfDoc: PDFDocument, xmpXml: string | null): PdfaCheckResult {
  const issues: ValidationIssue[] = [];

  checkFontsEmbedded(pdfDoc, issues);
  checkOutputIntent(pdfDoc, issues);
  checkPdfaIdMarkers(xmpXml, issues);
  checkFileId(pdfDoc, issues);

  const failed = issues.some((i) => i.level === 'error');
  if (failed) {
    return { conformance: 'failed', issues };
  }

  issues.push({
    code: 'pdfa3-structural-pass',
    level: 'warning',
    message:
      'Verified the load-bearing PDF/A-3u requirements in-process (embedded fonts, sRGB output intent, ' +
      'PDF/A identification, file ID). Full ISO 19005-3 conformance additionally requires the veraPDF gate ' +
      '(run `cv validate` in CI or the Docker runner in tools/verapdf-runner).',
  });
  return { conformance: 'structural-pass', issues };
}

/**
 * PDF/A-3u §6.2.11.4.1: every font used in the file MUST be embedded. This is
 * the single requirement a normal-looking input PDF most often violates: the
 * standard-14 base fonts (Helvetica, Times, Courier) are referenced by name with
 * no embedded program. We walk every Font dictionary, descend Type0 composite
 * fonts into their CIDFont descendant, and require a FontFile/FontFile2/FontFile3
 * in the descriptor. Type3 fonts carry their glyphs as content streams and need
 * no FontFile, so they are treated as embedded.
 */
function checkFontsEmbedded(pdfDoc: PDFDocument, issues: ValidationIssue[]): void {
  const seen = new Set<PDFObject>();
  const reported = new Set<string>();

  const walk = (value: PDFObject | undefined): void => {
    const obj = resolve(pdfDoc, value);
    if (obj === undefined || seen.has(obj)) return;
    seen.add(obj);

    if (obj instanceof PDFDict) {
      if (isFontDict(obj)) {
        const name = fontName(obj);
        if (!isFontEmbedded(pdfDoc, obj) && !reported.has(name)) {
          reported.add(name);
          issues.push({
            code: 'pdfa3-font-not-embedded',
            level: 'error',
            message:
              `Font "${name}" is not embedded; PDF/A-3u requires every font to be embedded ` +
              '(ISO 19005-3 §6.2.11.4.1). The input PDF used a non-embedded font (often a standard-14 ' +
              'base font from a minimal exporter). Re-export with fonts embedded, or normalize the PDF first.',
          });
        }
      }
      for (const [, child] of obj.entries()) {
        walk(child);
      }
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i += 1) {
        walk(obj.get(i));
      }
    }
  };

  walk(pdfDoc.catalog);
}

function isFontDict(dict: PDFDict): boolean {
  const type = dict.get(TYPE);
  return type instanceof PDFName && type.asString() === '/Font';
}

function fontSubtype(dict: PDFDict): string {
  const st = dict.get(SUBTYPE);
  return st instanceof PDFName ? st.asString() : '';
}

function fontName(dict: PDFDict): string {
  const bf = dict.get(BASE_FONT);
  if (bf instanceof PDFName) return bf.asString().replace(/^\//, '');
  return 'unknown';
}

function isFontEmbedded(pdfDoc: PDFDocument, fontDict: PDFDict): boolean {
  const subtype = fontSubtype(fontDict);

  // Type3 glyphs are inline content streams: embedded by construction.
  if (subtype === '/Type3') return true;

  // Type0 is a composite font: the real program lives on the CIDFont descendant.
  if (subtype === '/Type0') {
    const descendants = resolve(pdfDoc, fontDict.get(DESCENDANT_FONTS));
    if (descendants instanceof PDFArray && descendants.size() > 0) {
      const cidFont = resolve(pdfDoc, descendants.get(0));
      if (cidFont instanceof PDFDict) {
        return descriptorHasFontFile(pdfDoc, cidFont);
      }
    }
    return false;
  }

  return descriptorHasFontFile(pdfDoc, fontDict);
}

function descriptorHasFontFile(pdfDoc: PDFDocument, fontDict: PDFDict): boolean {
  const descriptor = resolve(pdfDoc, fontDict.get(FONT_DESCRIPTOR));
  if (!(descriptor instanceof PDFDict)) return false;
  return FONT_FILE_KEYS.some((key) => descriptor.get(key) !== undefined);
}

/**
 * PDF/A §6.2.2: an OutputIntent is only MANDATORY when the file uses
 * device-dependent colour (DeviceRGB/Gray/CMYK) without a calibrated
 * alternative. A text-only resume with no colour operators is conformant
 * without one, so its absence is reported as a warning, not a hard failure:
 * proving the colour condition in-process would require walking every content
 * stream, and false-failing a conformant file is worse than deferring to
 * veraPDF. `pack` adds an sRGB intent, so files this SDK produces always carry
 * one; a malformed intent that IS present is still only flagged as suspicious.
 */
function checkOutputIntent(pdfDoc: PDFDocument, issues: ValidationIssue[]): void {
  const intents = resolve(pdfDoc, pdfDoc.catalog.get(OUTPUT_INTENTS));
  if (!(intents instanceof PDFArray) || intents.size() === 0) {
    issues.push({
      code: 'pdfa3-no-output-intent',
      level: 'warning',
      message:
        'No /OutputIntents present. PDF/A-3u requires a GTS_PDFA1 output intent only when the file uses ' +
        'device-dependent colour (ISO 19005-3 §6.2.2); veraPDF makes the final call. `pack` adds an sRGB ' +
        'intent, so this is typically an externally produced file.',
    });
    return;
  }

  for (let i = 0; i < intents.size(); i += 1) {
    const intent = resolve(pdfDoc, intents.get(i));
    if (!(intent instanceof PDFDict)) continue;
    const s = intent.get(S_KEY);
    const isPdfaIntent = s instanceof PDFName && s.asString() === '/GTS_PDFA1';
    const hasProfile = resolve(pdfDoc, intent.get(DEST_OUTPUT_PROFILE)) !== undefined;
    if (isPdfaIntent && hasProfile) return;
  }

  issues.push({
    code: 'pdfa3-output-intent-incomplete',
    level: 'warning',
    message:
      'An /OutputIntents array is present but none is a GTS_PDFA1 intent carrying an embedded ' +
      'DestOutputProfile; veraPDF will confirm whether this is conformant (ISO 19005-3 §6.2.2).',
  });
}

/**
 * PDF/A §6.7.11: the file MUST be identified as PDF/A in XMP via the pdfaid
 * namespace: pdfaid:part = 3 and pdfaid:conformance = A | U | B. These appear
 * only in metadata, so we read the XMP packet directly. Both attribute form
 * (rdf:Description pdfaid:part="3") and element form are accepted.
 */
function checkPdfaIdMarkers(xmpXml: string | null, issues: ValidationIssue[]): void {
  if (!xmpXml) {
    issues.push({
      code: 'pdfa3-no-id-markers',
      level: 'error',
      message: 'XMP packet is absent; PDF/A-3u requires pdfaid:part and pdfaid:conformance markers.',
    });
    return;
  }

  const part = readXmpValue(xmpXml, 'pdfaid:part');
  const conformance = readXmpValue(xmpXml, 'pdfaid:conformance');

  if (part !== '3') {
    issues.push({
      code: 'pdfa3-id-part-mismatch',
      level: 'error',
      message: `PDF/A identification pdfaid:part is "${part ?? 'absent'}"; PDF/A-3u requires part 3 (ISO 19005-3 §6.7.11).`,
    });
  }
  if (!conformance || !['A', 'U', 'B'].includes(conformance)) {
    issues.push({
      code: 'pdfa3-id-conformance-missing',
      level: 'error',
      message:
        `PDF/A identification pdfaid:conformance is "${conformance ?? 'absent'}"; ` +
        'PDF/A-3u requires A, U, or B (ISO 19005-3 §6.7.11).',
    });
  }
}

/** Read a pdfaid value in either attribute (`pdfaid:part="3"`) or element (`<pdfaid:part>3</pdfaid:part>`) form. */
function readXmpValue(xml: string, key: string): string | null {
  const attr = new RegExp(`${escapeRe(key)}\\s*=\\s*["']([^"']*)["']`).exec(xml);
  if (attr?.[1] !== undefined) return attr[1].trim();
  const elem = new RegExp(`<${escapeRe(key)}[^>]*>([^<]*)</${escapeRe(key)}>`).exec(xml);
  if (elem?.[1] !== undefined) return elem[1].trim();
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** PDF/A §6.1.3: the trailer MUST contain a file identifier (/ID). */
function checkFileId(pdfDoc: PDFDocument, issues: ValidationIssue[]): void {
  const id = pdfDoc.context.trailerInfo.ID;
  const hasId = id instanceof PDFArray && id.size() >= 2;
  if (!hasId) {
    issues.push({
      code: 'pdfa3-no-file-id',
      level: 'error',
      message: 'Trailer is missing a file identifier (/ID); PDF/A-3u requires one (ISO 19005-3 §6.1.3).',
    });
  }
}

function resolve(pdfDoc: PDFDocument, value: PDFObject | undefined): PDFObject | undefined {
  if (value === undefined) return undefined;
  return pdfDoc.context.lookup(value) ?? value;
}
