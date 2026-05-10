import { DEFAULT_PAYLOAD_NAMES, PAYLOAD_MIME_TYPES } from './constants.js';
import { decodeEmbeddings, type EmbeddingsPayload } from './embeddings.js';
import { toUint8Array, utf8 } from './normalize.js';
import { loadDocument, readAssociatedFiles, readMetadataXml, toExtractedPayload } from './pdf.js';
import type { BinaryInput, CvFile, CvMetadata, ExtractedPayload } from './types.js';
import { parseXmp } from './xmp.js';

export async function extract(input: BinaryInput): Promise<CvFile> {
  const bytes = await toUint8Array(input);
  const pdfDoc = await loadDocument(bytes);

  const xml = readMetadataXml(pdfDoc);
  const metadata: CvMetadata =
    (xml ? parseXmp(xml) : null) ??
    (() => {
      throw new Error('Not a .cv file: missing or invalid XMP metadata');
    })();

  const raw = readAssociatedFiles(pdfDoc);
  const payloads: ExtractedPayload[] = raw.map((r) => {
    const alt = metadata.alternates.find((a) => a.payload === r.name);
    return toExtractedPayload(r, alt?.language ?? metadata.primaryLanguage);
  });

  return { bytes, metadata, payloads };
}

export async function extractMarkdown(
  input: BinaryInput,
  opts: { language?: string } = {},
): Promise<string | null> {
  const file = await extract(input);
  const md = pickByLanguage(file.payloads, PAYLOAD_MIME_TYPES.markdown, opts.language ?? file.metadata.primaryLanguage);
  return md ? md.text() : null;
}

export async function extractHtml(
  input: BinaryInput,
  opts: { language?: string } = {},
): Promise<string | null> {
  const file = await extract(input);
  const html = pickByLanguage(file.payloads, PAYLOAD_MIME_TYPES.html, opts.language ?? file.metadata.primaryLanguage);
  return html ? html.text() : null;
}

export async function extractEmbeddings(input: BinaryInput): Promise<Uint8Array | null> {
  const file = await extract(input);
  const emb = file.payloads.find((p) => p.name === DEFAULT_PAYLOAD_NAMES.embeddings);
  return emb ? emb.bytes : null;
}

export async function extractEmbeddingsParsed(input: BinaryInput): Promise<EmbeddingsPayload | null> {
  const bytes = await extractEmbeddings(input);
  return bytes ? decodeEmbeddings(bytes) : null;
}

function pickByLanguage(
  payloads: ExtractedPayload[],
  mimeType: string,
  preferredLanguage: string,
): ExtractedPayload | undefined {
  const matches = payloads.filter((p) => p.mimeType === mimeType);
  if (matches.length === 0) return undefined;
  const preferred = matches.find((p) => p.language === preferredLanguage);
  return preferred ?? matches[0];
}

export { utf8 };
