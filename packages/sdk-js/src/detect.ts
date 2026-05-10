import { CV_NAMESPACE_URI } from './constants.js';
import { toUint8Array } from './normalize.js';
import { loadDocument, readMetadataXml } from './pdf.js';
import type { BinaryInput } from './types.js';

export async function isCvFile(input: BinaryInput): Promise<boolean> {
  try {
    const bytes = await toUint8Array(input);
    if (bytes.length < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
      return false;
    }
    const pdfDoc = await loadDocument(bytes);
    const xml = readMetadataXml(pdfDoc);
    if (!xml) return false;
    return xml.includes(CV_NAMESPACE_URI);
  } catch {
    return false;
  }
}
