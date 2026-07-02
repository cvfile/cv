import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  PDFString,
} from 'pdf-lib';
import * as pako from 'pako';
import { CvError } from './errors.js';
import type { AFRelationshipKind, ExtractedPayload } from './types.js';
import { utf8 } from './normalize.js';

const AF_NAME = PDFName.of('AF');
const F_NAME = PDFName.of('F');
const UF_NAME = PDFName.of('UF');
const EF_NAME = PDFName.of('EF');
const DESC_NAME = PDFName.of('Desc');
const SUBTYPE_NAME = PDFName.of('Subtype');
const AF_REL_NAME = PDFName.of('AFRelationship');
const METADATA_NAME = PDFName.of('Metadata');
const FILTER_NAME = PDFName.of('Filter');

const KNOWN_RELATIONSHIPS: AFRelationshipKind[] = ['Alternative', 'Data', 'Supplement'];

export interface RawPayload {
  name: string;
  mimeType: string;
  description?: string;
  relationship: AFRelationshipKind;
  bytes: Uint8Array;
  /**
   * True when the payload's decoded size exceeded the caller's cap and
   * decompression was aborted mid-stream; `bytes` is empty in that case.
   */
  oversize?: boolean;
}

export interface ReadAssociatedFilesOptions {
  /**
   * Per-payload decoded-byte cap (spec §7.3). Decompression aborts as soon as
   * the inflated output crosses the cap, so a small compressed "bomb" is never
   * fully expanded in memory; the payload is returned with `oversize: true`.
   */
  maxPayloadBytes?: number;
}

export async function loadDocument(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: false,
    // Parse encrypted files instead of throwing, so the validator can surface
    // the authoritative /Encrypt trailer entry as the documented spec-§3.4
    // error code rather than a generic parse failure.
    ignoreEncryption: true,
  });
}

export function readAssociatedFiles(pdfDoc: PDFDocument, opts: ReadAssociatedFilesOptions = {}): RawPayload[] {
  const catalog = pdfDoc.catalog;
  const afRaw = catalog.get(AF_NAME);
  if (!afRaw) return [];

  const afArray = pdfDoc.context.lookup(afRaw, PDFArray);
  const out: RawPayload[] = [];
  for (let i = 0; i < afArray.size(); i += 1) {
    const filespecRaw = afArray.get(i)!;
    const filespec = pdfDoc.context.lookup(filespecRaw, PDFDict);
    const payload = parseFilespec(pdfDoc, filespec, opts);
    if (payload) out.push(payload);
  }
  return out;
}

function parseFilespec(pdfDoc: PDFDocument, filespec: PDFDict, opts: ReadAssociatedFilesOptions): RawPayload | null {
  const efRaw = filespec.get(EF_NAME);
  if (!efRaw) return null;
  const efDict = pdfDoc.context.lookup(efRaw, PDFDict);

  const streamRef = efDict.get(UF_NAME) ?? efDict.get(F_NAME);
  if (!streamRef) return null;
  const stream = pdfDoc.context.lookup(streamRef);
  if (!(stream instanceof PDFStream)) return null;

  const name = readString(filespec, UF_NAME) ?? readString(filespec, F_NAME) ?? '';
  if (!name) return null;

  let bytes: Uint8Array | null;
  let oversize = false;
  try {
    bytes = decodeStream(stream, opts.maxPayloadBytes !== undefined ? { maxBytes: opts.maxPayloadBytes } : {});
  } catch (err) {
    if (err instanceof CvError && err.code === 'payload-too-large') {
      // Decompression was aborted at the cap; surface the payload as oversize
      // so callers can report it (validate) or reject it (extract) by name.
      bytes = new Uint8Array(0);
      oversize = true;
    } else {
      throw err;
    }
  }
  if (!bytes) return null;

  const subtype = stream.dict.get(SUBTYPE_NAME) ?? filespec.get(SUBTYPE_NAME);
  const mimeType = subtype instanceof PDFName ? decodeMimeName(subtype) : 'application/octet-stream';

  const desc = readString(filespec, DESC_NAME);

  const rel = filespec.get(AF_REL_NAME);
  const relName = rel instanceof PDFName ? rel.asString().slice(1) : 'Unspecified';
  const relationship = (KNOWN_RELATIONSHIPS as string[]).includes(relName)
    ? (relName as AFRelationshipKind)
    : 'Supplement';

  const payload: RawPayload = { name, mimeType, relationship, bytes };
  if (oversize) payload.oversize = true;
  if (desc !== undefined) payload.description = desc;
  return payload;
}

// A MIME type carried in a PDF /Subtype name has its '/' written as the hex
// escape #2F (ISO 32000 §7.3.5). That escape is case-insensitive, but pd-lib's
// name parser only decodes UPPERCASE escapes (PDFName.decodeName uses
// /#[\dABCDEF]{2}/), so a producer that emits lowercase (#2f, as Go's pdfcpu
// does) slips past it and is re-escaped in asString() to /text#232fmarkdown.
// decodeText() returns the name's actual byte content (text#2fmarkdown), over
// which a single case-insensitive #XX pass yields the true MIME for either
// producer, keeping the reader conformant to the PDF spec rather than to one
// library's quirk.
function decodeMimeName(name: PDFName): string {
  return name.decodeText().replace(/#([0-9a-fA-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function readString(dict: PDFDict, key: PDFName): string | undefined {
  const value = dict.get(key);
  if (!value) return undefined;
  if (value instanceof PDFString) return decodePdfStringEscapes(value.asString());
  if (value instanceof PDFHexString) return value.decodeText();
  return undefined;
}

// pdf-lib's PDFString.asString() returns the raw bytes verbatim. PDF spec
// (ISO 32000-1 §7.3.4.2) defines backslash escapes inside literal strings:
// \n \r \t \b \f \( \) \\ and three-digit octal codes \NNN. Some producers
// (notably pypdf) escape characters like '.' as their octal code (\056), which
// is legal but means downstream consumers must decode. We do that here.
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
      if (j < s.length && s[j]! >= '0' && s[j]! <= '7') {
        octal += s[j]!;
        j += 1;
        if (j < s.length && s[j]! >= '0' && s[j]! <= '7') {
          octal += s[j]!;
          j += 1;
        }
      }
      out += String.fromCharCode(parseInt(octal, 8));
      i = j;
      continue;
    }
    switch (next) {
      case 'n':
        out += '\n';
        break;
      case 'r':
        out += '\r';
        break;
      case 't':
        out += '\t';
        break;
      case 'b':
        out += '\b';
        break;
      case 'f':
        out += '\f';
        break;
      case '(':
      case ')':
      case '\\':
        out += next;
        break;
      case '\n':
      case '\r':
        // line continuation; consume the line break
        break;
      default:
        out += next;
    }
    i += 2;
  }
  return out;
}

export function readMetadataXml(pdfDoc: PDFDocument): string | null {
  const metaRaw = pdfDoc.catalog.get(METADATA_NAME);
  if (!metaRaw) return null;
  const stream = pdfDoc.context.lookup(metaRaw);
  if (!(stream instanceof PDFStream)) return null;
  const bytes = decodeStream(stream);
  if (!bytes) return null;
  return utf8(bytes);
}

export function setMetadataXml(pdfDoc: PDFDocument, xml: string): void {
  const bytes = new TextEncoder().encode(xml);
  const metaStream = pdfDoc.context.stream(bytes, {
    Type: 'Metadata',
    Subtype: 'XML',
    Length: bytes.length,
  });
  const ref = pdfDoc.context.register(metaStream);
  pdfDoc.catalog.set(METADATA_NAME, ref);
}

interface DecodeStreamOptions {
  /** Decoded-byte cap; decoding aborts with a 'payload-too-large' CvError once crossed. */
  maxBytes?: number;
}

function decodeStream(stream: PDFStream, opts: DecodeStreamOptions = {}): Uint8Array | null {
  const dict = stream.dict;
  const filter = dict.get(FILTER_NAME);
  const maxBytes = opts.maxBytes ?? Number.POSITIVE_INFINITY;

  let raw: Uint8Array;
  if (stream instanceof PDFRawStream) {
    raw = stream.contents;
  } else {
    const buf = stream.getContents();
    raw = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBufferLike);
  }

  if (!filter) {
    assertWithinCap(raw.length, maxBytes);
    return raw;
  }

  const filterName = filter instanceof PDFName ? filter.asString().slice(1) : null;
  const filters: string[] = [];
  if (filterName) {
    filters.push(filterName);
  } else if (filter instanceof PDFArray) {
    for (let i = 0; i < filter.size(); i += 1) {
      const f = filter.get(i);
      if (f instanceof PDFName) filters.push(f.asString().slice(1));
    }
  }

  const decodeParms = collectDecodeParms(stream.dict, filters.length);

  let bytes: Uint8Array = raw;
  for (let i = 0; i < filters.length; i += 1) {
    const f = filters[i]!;
    if (f === 'FlateDecode') {
      assertNoPredictor(decodeParms[i]);
      bytes = inflateCapped(bytes, maxBytes);
    } else {
      return null;
    }
  }
  assertWithinCap(bytes.length, maxBytes);
  return bytes;
}

function assertWithinCap(length: number, maxBytes: number): void {
  if (length > maxBytes) {
    throw new CvError(
      'payload-too-large',
      `Decoded stream is ${length} bytes; cap is ${maxBytes} (spec §7.3)`,
    );
  }
}

/**
 * Inflate through pako's streaming API with a hard output cap. `onData` fires
 * per decompressed chunk, so a maliciously compressed stream (a "zip bomb")
 * is aborted as soon as its output crosses `maxBytes` instead of being fully
 * expanded into memory first.
 */
function inflateCapped(input: Uint8Array, maxBytes: number): Uint8Array {
  const inflator = new pako.Inflate();
  const chunks: Uint8Array[] = [];
  let total = 0;
  inflator.onData = (chunk: pako.Data) => {
    const data = chunk as Uint8Array;
    total += data.length;
    if (total > maxBytes) {
      throw new CvError(
        'payload-too-large',
        `Decompressed stream exceeds the ${maxBytes}-byte cap (spec §7.3); decompression aborted`,
      );
    }
    chunks.push(data);
  };
  inflator.push(input, true);
  if (inflator.err) {
    throw new Error(`FlateDecode failed: ${inflator.msg || `pako error ${inflator.err}`}`);
  }
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const DECODE_PARMS_NAME = PDFName.of('DecodeParms');
const PREDICTOR_NAME = PDFName.of('Predictor');

/**
 * Returns the /DecodeParms dictionary that applies to each filter, in filter
 * order. /DecodeParms may be a single dict (one filter) or an array aligned
 * with /Filter; missing entries are undefined (no parameters).
 */
function collectDecodeParms(dict: PDFDict, filterCount: number): (PDFDict | undefined)[] {
  const out: (PDFDict | undefined)[] = new Array(filterCount).fill(undefined);
  const parms = dict.get(DECODE_PARMS_NAME);
  if (parms instanceof PDFDict) {
    out[0] = parms;
  } else if (parms instanceof PDFArray) {
    for (let i = 0; i < parms.size() && i < filterCount; i += 1) {
      const entry = parms.get(i);
      if (entry instanceof PDFDict) out[i] = entry;
    }
  }
  return out;
}

/**
 * FlateDecode streams may declare a PNG/TIFF /Predictor in /DecodeParms. This
 * SDK does not implement predictor reversal, so rather than silently returning
 * garbage we reject such streams with a clear, actionable error.
 */
function assertNoPredictor(parms: PDFDict | undefined): void {
  if (!parms) return;
  const predictor = parms.get(PREDICTOR_NAME);
  if (predictor instanceof PDFNumber && predictor.asNumber() > 1) {
    throw new Error(
      `Unsupported FlateDecode /DecodeParms /Predictor ${predictor.asNumber()}; ` +
        'PNG/TIFF predictors are not supported by this SDK',
    );
  }
}

export function toExtractedPayload(raw: RawPayload, language?: string): ExtractedPayload {
  const out: ExtractedPayload = {
    name: raw.name,
    mimeType: raw.mimeType,
    relationship: raw.relationship,
    bytes: raw.bytes,
    text: () => utf8(raw.bytes),
  };
  if (raw.description !== undefined) out.description = raw.description;
  if (language !== undefined) out.language = language;
  return out;
}

