/**
 * Tiny standalone detector for the .cv open file format.
 *
 * A .cv file is a valid PDF that carries Markdown and HTML payloads via PDF
 * Associated Files (/AF). Crawlers that already read application/pdf can use
 * this module to (a) detect a .cv wrapper inside an arbitrary PDF and (b)
 * unwrap the canonical Markdown payload directly, skipping OCR over the
 * visual layer entirely.
 *
 * Detection is dependency free (regex over the PDF bytes). Unwrap depends on
 * pdf-lib only because PDF stream parsing without a library is genuinely
 * error prone.
 *
 * Spec: https://cvfile.org/spec/
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';

export const CV_NAMESPACE_URI = 'http://ns.cvfile.org/cv/1.0/';

export interface CvDetection {
  isCvFile: boolean;
  version?: string;
  primaryPayload?: string;
  primaryLanguage?: string;
  generator?: string;
}

export interface UnwrappedPayload {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * Detect whether `pdfBytes` is a .cv file. Zero dependencies, byte scan only.
 * Any false positive on the namespace check is filtered out by the follow-up
 * cv:version regex.
 */
export function detect(pdfBytes: Uint8Array): CvDetection {
  if (pdfBytes.length < 4 || !hasPrefix(pdfBytes, '%PDF')) {
    return { isCvFile: false };
  }
  const text = bytesToLatin1(pdfBytes);
  if (!text.includes(CV_NAMESPACE_URI)) {
    return { isCvFile: false };
  }
  const version = innerTag(text, 'cv:version');
  if (!version) {
    return { isCvFile: false };
  }
  const out: CvDetection = { isCvFile: true, version };
  const pp = innerTag(text, 'cv:primaryPayload');
  if (pp) out.primaryPayload = pp;
  const pl = innerTag(text, 'cv:primaryLanguage');
  if (pl) out.primaryLanguage = pl;
  const gen = innerTag(text, 'cv:generator');
  if (gen) out.generator = gen;
  return out;
}

/**
 * Extract one /AF Associated File from a .cv file by name. If `payloadName`
 * is omitted, returns the payload declared by cv:primaryPayload (typically
 * `resume.md`). Returns null when the input is not a .cv or the named
 * payload is not present.
 */
export async function unwrap(
  pdfBytes: Uint8Array,
  payloadName?: string,
): Promise<UnwrappedPayload | null> {
  const det = detect(pdfBytes);
  if (!det.isCvFile) return null;
  const target = payloadName ?? det.primaryPayload;
  if (!target) return null;

  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return null;
  }

  const afRaw = pdfDoc.catalog.get(PDFName.of('AF'));
  if (!afRaw) return null;
  const afArray = pdfDoc.context.lookup(afRaw, PDFArray);

  for (let i = 0; i < afArray.size(); i += 1) {
    const filespec = pdfDoc.context.lookup(afArray.get(i)!, PDFDict);
    const name =
      readString(filespec, PDFName.of('UF')) ?? readString(filespec, PDFName.of('F')) ?? '';
    if (name !== target) continue;

    const efRaw = filespec.get(PDFName.of('EF'));
    if (!efRaw) continue;
    const ef = pdfDoc.context.lookup(efRaw, PDFDict);
    const streamRef = ef.get(PDFName.of('UF')) ?? ef.get(PDFName.of('F'));
    if (!streamRef) continue;
    const stream = pdfDoc.context.lookup(streamRef);
    if (!(stream instanceof PDFStream)) continue;

    const bytes = decodeStream(stream);
    if (!bytes) continue;

    const subtype = stream.dict.get(PDFName.of('Subtype')) ?? filespec.get(PDFName.of('Subtype'));
    const mimeType = subtype instanceof PDFName ? decodeMimeName(subtype) : 'application/octet-stream';
    return { name, mimeType, bytes };
  }

  return null;
}

function hasPrefix(bytes: Uint8Array, prefix: string): boolean {
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix.charCodeAt(i)) return false;
  }
  return true;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return out;
}

// Reads a cv XMP field. RDF allows two equivalent serialisations: the element
// form <cv:version>1.0</cv:version> and the attribute form cv:version="1.0".
// Try the element form first, then fall back to the attribute form so both
// shapes are detected identically.
function innerTag(text: string, tag: string): string | undefined {
  const q = escapeRegex(tag);
  const elem = new RegExp(`<${q}>([^<]*)</${q}>`);
  const em = elem.exec(text);
  if (em) return em[1]!.trim();
  const attr = new RegExp(`${q}\\s*=\\s*"([^"]*)"|${q}\\s*=\\s*'([^']*)'`);
  const am = attr.exec(text);
  if (am) return (am[1] ?? am[2] ?? '').trim();
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeMimeName(name: PDFName): string {
  return name
    .asString()
    .slice(1)
    .replace(/#([0-9a-fA-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function readString(dict: PDFDict, key: PDFName): string | undefined {
  const value = dict.get(key);
  if (!value) return undefined;
  if (value instanceof PDFString) return decodePdfStringEscapes(value.asString());
  if (value instanceof PDFHexString) return value.decodeText();
  return undefined;
}

function decodeStream(stream: PDFStream): Uint8Array | null {
  try {
    return decodePDFRawStream(stream as never).decode();
  } catch {
    return null;
  }
}

// PDF spec §7.3.4.2: \n \r \t \b \f \( \) \\ and three-digit octal \NNN.
// pypdf escapes characters like '.' as octal (e.g. \056); we must decode so
// "resume\056md" comes back as "resume.md".
function decodePdfStringEscapes(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c !== '\\') {
      out += c;
      i += 1;
      continue;
    }
    const next = s[i + 1];
    if (next === undefined) {
      out += c;
      i += 1;
      continue;
    }
    if (next >= '0' && next <= '7') {
      let octal = next;
      let j = i + 2;
      while (j < s.length && octal.length < 3 && s[j]! >= '0' && s[j]! <= '7') {
        octal += s[j]!;
        j += 1;
      }
      out += String.fromCharCode(parseInt(octal, 8));
      i = j;
      continue;
    }
    switch (next) {
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case '(':
      case ')':
      case '\\': out += next; break;
      default: out += next;
    }
    i += 2;
  }
  return out;
}
