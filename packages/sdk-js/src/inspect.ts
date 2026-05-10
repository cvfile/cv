import { toUint8Array } from './normalize.js';
import { loadDocument, readMetadataXml } from './pdf.js';
import type { BinaryInput, CvMetadata } from './types.js';
import { parseXmp } from './xmp.js';

export async function inspect(input: BinaryInput): Promise<CvMetadata> {
  const bytes = await toUint8Array(input);
  const pdfDoc = await loadDocument(bytes);
  const xml = readMetadataXml(pdfDoc);
  if (!xml) {
    throw new Error('Not a .cv file: no XMP metadata in catalog');
  }
  const meta = parseXmp(xml);
  if (!meta) {
    throw new Error('Not a .cv file: XMP metadata missing required cv: properties');
  }
  return meta;
}
