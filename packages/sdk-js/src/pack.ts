import { AFRelationship, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFStream, PDFString } from 'pdf-lib';
import { CV_SPEC_VERSION, DEFAULT_GENERATOR, DEFAULT_PAYLOAD_NAMES, PAYLOAD_MIME_TYPES } from './constants.js';
import { md5Hex, sha256Hex } from './digest.js';
import { encodeEmbeddings, type EmbeddingsPayload } from './embeddings.js';
import { toBytes, toUint8Array } from './normalize.js';
import { setMetadataXml } from './pdf.js';
import { srgbIccProfile, SRGB_ICC_COMPONENTS, SRGB_ICC_VERSION } from './srgb-profile.js';
import type { AlternateMeta, EmbeddingSpaceSummary, IntegrityEntry, PackInput, Payload } from './types.js';
import { buildXmp } from './xmp.js';

export async function pack(input: PackInput): Promise<Uint8Array> {
  const pdfBytes = await toUint8Array(input.pdf);
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });

  const { payloads, embeddingSummaries } = collectPayloads(input);
  if (payloads.length === 0) {
    throw new Error('At least one payload (markdown, html, json, embeddings, or payloads[]) is required');
  }

  const primaryPayload = input.metadata.primaryPayload ?? defaultPrimary(payloads);
  if (!payloads.some((p) => p.name === primaryPayload)) {
    throw new Error(`primaryPayload "${primaryPayload}" not found among payloads`);
  }

  const created = input.metadata.created ?? new Date();
  const modified = input.metadata.modified ?? created;

  const integrityMode = input.metadata.integrity ?? 'sha-256';
  const integrity: IntegrityEntry[] = [];
  if (integrityMode === 'sha-256') {
    for (const p of payloads) {
      const bytes = toBytes(p.data);
      const digest = await sha256Hex(bytes);
      integrity.push({ payload: p.name, algorithm: 'sha-256', digest });
    }
  }

  const payloadBytesByName = new Map<string, Uint8Array>();
  for (const p of payloads) {
    const bytes = toBytes(p.data);
    payloadBytesByName.set(p.name, bytes);
    pdfDoc.attach(bytes, p.name, {
      mimeType: p.mimeType,
      description: p.description ?? defaultDescription(p),
      creationDate: created,
      modificationDate: modified,
      afRelationship: relationshipToEnum(p.relationship ?? 'Alternative'),
    });
  }

  const alternates = payloads
    .filter((p) => p.name !== primaryPayload && (p.relationship ?? 'Alternative') === 'Alternative')
    .map<AlternateMeta>((p) => ({
      payload: p.name,
      language: p.language ?? input.metadata.primaryLanguage,
      mimeType: p.mimeType,
    }));

  const xmp = buildXmp({
    version: CV_SPEC_VERSION,
    primaryLanguage: input.metadata.primaryLanguage,
    primaryPayload,
    created,
    modified,
    generator: input.metadata.generator ?? DEFAULT_GENERATOR,
    alternates,
    integrity,
    embeddings: embeddingSummaries,
  });
  setMetadataXml(pdfDoc, xmp);

  if (input.pdfa !== false) {
    addPdfaOutputIntent(pdfDoc);
    setTrailerId(pdfDoc);
  }

  // Materialize the embedded-file streams so we can amend their /Params before
  // serialization. flush() is idempotent (each embeddable guards re-embedding).
  await pdfDoc.flush();
  setEmbeddedFileChecksums(pdfDoc, payloadBytesByName, created, modified);
  setInfoDates(pdfDoc, created, modified);

  return pdfDoc.save({ useObjectStreams: false });
}

const PARAMS = PDFName.of('Params');
const CHECKSUM = PDFName.of('CheckSum');
const CREATION_DATE = PDFName.of('CreationDate');
const MOD_DATE = PDFName.of('ModDate');

/**
 * Set the spec-mandated MD5 /CheckSum (spec §4.1) on each embedded-file
 * stream's /Params, computed over the unwrapped payload bytes. pdf-lib emits
 * /Size and /ModDate but never /CheckSum. Dates are rewritten with an explicit
 * UTC offset so they agree with the XMP UTC dateTime (PDF/A-3 date hygiene).
 */
function setEmbeddedFileChecksums(
  pdfDoc: PDFDocument,
  payloadBytesByName: Map<string, Uint8Array>,
  created: Date,
  modified: Date,
): void {
  const afRaw = pdfDoc.catalog.get(PDFName.of('AF'));
  if (!afRaw) return;
  const afArray = pdfDoc.context.lookup(afRaw, PDFArray);

  for (let i = 0; i < afArray.size(); i += 1) {
    const filespec = pdfDoc.context.lookup(afArray.get(i), PDFDict);
    const name = filespecName(filespec);
    const efRaw = filespec.get(PDFName.of('EF'));
    if (!efRaw) continue;
    const efDict = pdfDoc.context.lookup(efRaw, PDFDict);
    const streamRef = efDict.get(PDFName.of('F')) ?? efDict.get(PDFName.of('UF'));
    const stream = pdfDoc.context.lookup(streamRef);
    if (!(stream instanceof PDFStream)) continue;

    const bytes = name ? payloadBytesByName.get(name) : undefined;
    if (!bytes) continue;

    let params = stream.dict.get(PARAMS);
    if (!(params instanceof PDFDict)) {
      params = pdfDoc.context.obj({});
      stream.dict.set(PARAMS, params);
    }
    const paramsDict = params as PDFDict;
    paramsDict.set(CHECKSUM, PDFHexString.of(md5Hex(bytes)));
    paramsDict.set(CREATION_DATE, PDFString.of(pdfDate(created)));
    paramsDict.set(MOD_DATE, PDFString.of(pdfDate(modified)));
  }
}

function filespecName(filespec: PDFDict): string | undefined {
  const uf = filespec.get(PDFName.of('UF'));
  if (uf instanceof PDFHexString) return uf.decodeText();
  if (uf instanceof PDFString) return uf.asString();
  const f = filespec.get(PDFName.of('F'));
  if (f instanceof PDFString) return f.asString();
  if (f instanceof PDFHexString) return f.decodeText();
  return undefined;
}

/**
 * Set the document Info CreationDate/ModDate to the cv created/modified values
 * with an explicit UTC offset so they match the XMP UTC dateTime.
 */
function setInfoDates(pdfDoc: PDFDocument, created: Date, modified: Date): void {
  const info = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info, PDFDict);
  info.set(CREATION_DATE, PDFString.of(pdfDate(created)));
  info.set(MOD_DATE, PDFString.of(pdfDate(modified)));
}

/** PDF date string in UTC with an explicit "+00'00'" offset (ISO 32000 §7.9.4). */
function pdfDate(d: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return (
    `D:${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}+00'00'`
  );
}

function addPdfaOutputIntent(pdfDoc: PDFDocument): void {
  const existing = pdfDoc.catalog.lookup(PDFName.of('OutputIntents'));
  if (existing instanceof PDFArray && existing.size() > 0) {
    return;
  }

  const iccBytes = srgbIccProfile();
  const iccStream = pdfDoc.context.stream(iccBytes, {
    N: SRGB_ICC_COMPONENTS,
    Length: iccBytes.length,
  });
  const iccRef = pdfDoc.context.register(iccStream);

  const outputIntent = pdfDoc.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of(SRGB_ICC_VERSION),
    Info: PDFString.of(SRGB_ICC_VERSION),
    DestOutputProfile: iccRef,
    RegistryName: PDFString.of('http://www.color.org'),
  });

  const arr = pdfDoc.context.obj([outputIntent]);
  pdfDoc.catalog.set(PDFName.of('OutputIntents'), arr);
}

function setTrailerId(pdfDoc: PDFDocument): void {
  const id = PDFHexString.of(randomHex(16));
  const idArray = pdfDoc.context.obj([id, id]);
  // pdf-lib exposes trailerInfo as a public field on PDFContext for this purpose.
  (pdfDoc.context as unknown as { trailerInfo: { ID: PDFArray } }).trailerInfo.ID = idArray;
}

function randomHex(byteLen: number): string {
  const buf = new Uint8Array(byteLen);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < byteLen; i += 1) buf[i] = Math.floor(Math.random() * 256);
  }
  let hex = '';
  for (let i = 0; i < buf.length; i += 1) {
    hex += buf[i]!.toString(16).padStart(2, '0').toUpperCase();
  }
  return hex;
}

function collectPayloads(input: PackInput): { payloads: Payload[]; embeddingSummaries: EmbeddingSpaceSummary[] } {
  const out: Payload[] = [];
  const embeddingSummaries: EmbeddingSpaceSummary[] = [];

  if (input.markdown !== undefined) {
    out.push({
      data: input.markdown,
      name: DEFAULT_PAYLOAD_NAMES.markdown,
      mimeType: PAYLOAD_MIME_TYPES.markdown,
      relationship: 'Alternative',
    });
  }
  if (input.html !== undefined) {
    out.push({
      data: input.html,
      name: DEFAULT_PAYLOAD_NAMES.html,
      mimeType: PAYLOAD_MIME_TYPES.html,
      relationship: 'Alternative',
    });
  }
  if (input.json !== undefined) {
    out.push({
      data: JSON.stringify(input.json, null, 2),
      name: DEFAULT_PAYLOAD_NAMES.json,
      mimeType: PAYLOAD_MIME_TYPES.json,
      relationship: 'Alternative',
    });
  }

  const embBytes = resolveEmbeddings(input.embeddings, embeddingSummaries);
  if (embBytes) {
    out.push({
      data: embBytes,
      name: DEFAULT_PAYLOAD_NAMES.embeddings,
      mimeType: PAYLOAD_MIME_TYPES.embeddings,
      relationship: 'Data',
    });
  }

  if (input.payloads) {
    for (const p of input.payloads) {
      out.push(p);
    }
  }

  const seen = new Set<string>();
  for (const p of out) {
    assertPortableName(p.name);
    if (seen.has(p.name)) {
      throw new Error(`Duplicate payload name: ${p.name}`);
    }
    seen.add(p.name);
  }
  return { payloads: out, embeddingSummaries };
}

/** Matches the POSIX-portable filename charset required by spec §4.4. */
export const PORTABLE_NAME_RE = /^[A-Za-z0-9._/-]+$/;

/**
 * Reject payload names that are not POSIX-portable (spec §4.4) or that contain
 * "." / ".." path segments, which would allow path traversal on extraction.
 */
export function assertPortableName(name: string): void {
  if (!PORTABLE_NAME_RE.test(name)) {
    throw new Error(`Payload name "${name}" is not POSIX-portable; allowed charset is [A-Za-z0-9._/-] (spec §4.4)`);
  }
  for (const segment of name.split('/')) {
    if (segment === '.' || segment === '..') {
      throw new Error(`Payload name "${name}" contains a "${segment}" path segment (spec §4.4)`);
    }
  }
}

function resolveEmbeddings(
  input: PackInput['embeddings'],
  summaryOut: EmbeddingSpaceSummary[],
): Uint8Array | undefined {
  if (input === undefined) return undefined;
  if (input instanceof Uint8Array) {
    return input;
  }
  const payload = input as EmbeddingsPayload;
  for (const space of payload.spaces) {
    summaryOut.push({
      model: space.model,
      dimension: space.dimension,
      metric: space.metric,
      chunks: space.chunks.length,
    });
  }
  return encodeEmbeddings(payload);
}

function defaultPrimary(payloads: Payload[]): string {
  const md = payloads.find((p) => p.name === DEFAULT_PAYLOAD_NAMES.markdown);
  if (md) return md.name;
  const html = payloads.find((p) => p.name === DEFAULT_PAYLOAD_NAMES.html);
  if (html) return html.name;
  const firstAlternative = payloads.find((p) => (p.relationship ?? 'Alternative') === 'Alternative');
  if (firstAlternative) return firstAlternative.name;
  return payloads[0]!.name;
}

function defaultDescription(p: Payload): string {
  if (p.mimeType === PAYLOAD_MIME_TYPES.markdown) return 'Markdown representation';
  if (p.mimeType === PAYLOAD_MIME_TYPES.html) return 'HTML representation';
  if (p.mimeType === PAYLOAD_MIME_TYPES.json) return 'JSON Resume representation';
  if (p.mimeType === PAYLOAD_MIME_TYPES.embeddings) return 'Pre-computed embeddings';
  return p.name;
}

function relationshipToEnum(rel: 'Alternative' | 'Data' | 'Supplement'): AFRelationship {
  switch (rel) {
    case 'Alternative':
      return AFRelationship.Alternative;
    case 'Data':
      return AFRelationship.Data;
    case 'Supplement':
      return AFRelationship.Supplement;
  }
}
