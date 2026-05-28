import { encode as cborEncode } from 'cbor-x';
import { PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts } from 'pdf-lib';
import * as pako from 'pako';
import { describe, expect, it } from 'vitest';
import { decodeEmbeddings, encodeEmbeddings, pack, validate, type EmbeddingsPayload } from '../src/index.js';

async function blankPdf(text = 'Sample CV'): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 30, y: 350, size: 18, font });
  return pdf.save();
}

const sampleEmbeddings: EmbeddingsPayload = {
  formatVersion: 1,
  spaces: [
    {
      model: 'BAAI/bge-m3',
      modelRevision: 'rev1',
      dimension: 4,
      metric: 'cosine',
      normalized: true,
      chunking: 'section',
      chunks: [{ id: 'a', textOffset: 0, textLength: 10, vector: new Float32Array([0.1, 0.2, 0.3, 0.4]) }],
    },
  ],
};

// Fix 1 — inline /OpenAction JavaScript action must be rejected.
describe('security: inline OpenAction JavaScript (fix 1)', () => {
  it('rejects a catalog /OpenAction stored as a direct (inline) JavaScript action', async () => {
    const cv = await pack({
      pdf: await blankPdf(),
      markdown: '# Hi\n',
      metadata: { primaryLanguage: 'en' },
    });

    // Re-open and inject an INLINE OpenAction so it is NOT an indirect object.
    const doc = await PDFDocument.load(cv, { updateMetadata: false });
    const openAction = doc.context.obj({
      Type: 'Action',
      S: 'JavaScript',
      JS: PDFString.of('app.alert("pwned");'),
    });
    doc.catalog.set(PDFName.of('OpenAction'), openAction);
    const tampered = await doc.save({ useObjectStreams: false });

    const report = await validate(tampered);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain('javascript-action');
  });

  it('still passes a clean file (no false positives)', async () => {
    const cv = await pack({
      pdf: await blankPdf(),
      markdown: '# Hi\n',
      metadata: { primaryLanguage: 'en' },
    });
    const report = await validate(cv);
    expect(report.ok).toBe(true);
  });
});

// Fix 2 — embedded-file /Params must carry an MD5 /CheckSum.
describe('pack: embedded-file /CheckSum (fix 2)', () => {
  it('writes a /CheckSum entry into each embedded-file /Params', async () => {
    const cv = await pack({
      pdf: await blankPdf(),
      markdown: '# Hi\n',
      metadata: { primaryLanguage: 'en' },
    });
    const text = new TextDecoder('latin1').decode(cv);
    expect(text).toMatch(/\/CheckSum/);
  });
});

// Fix 3 — non-portable payload names rejected on write and flagged on read.
describe('filename portability (fix 3)', () => {
  it('rejects path-traversal payload names at pack time', async () => {
    await expect(
      pack({
        pdf: await blankPdf(),
        payloads: [{ data: 'x', name: '../../etc/passwd', mimeType: 'text/plain', relationship: 'Supplement' }],
        markdown: '# Hi\n',
        metadata: { primaryLanguage: 'en' },
      }),
    ).rejects.toThrow(/portable|path segment/i);
  });

  it('rejects non-portable charset payload names at pack time', async () => {
    await expect(
      pack({
        pdf: await blankPdf(),
        payloads: [{ data: 'x', name: 'résumé .md', mimeType: 'text/plain', relationship: 'Supplement' }],
        markdown: '# Hi\n',
        metadata: { primaryLanguage: 'en' },
      }),
    ).rejects.toThrow(/portable/i);
  });

  it('flags a non-portable name on the read side', async () => {
    const cv = await pack({
      pdf: await blankPdf(),
      markdown: '# Hi\n',
      metadata: { primaryLanguage: 'en' },
    });
    // Inject a filespec with a non-portable name directly into /AF.
    const doc = await PDFDocument.load(cv, { updateMetadata: false });
    const stream = doc.context.flateStream(new TextEncoder().encode('bad'), {
      Type: 'EmbeddedFile',
      Subtype: 'text/plain',
    });
    const streamRef = doc.context.register(stream);
    const filespec = doc.context.obj({
      Type: 'Filespec',
      F: PDFString.of('../evil.txt'),
      UF: PDFString.of('../evil.txt'),
      EF: { F: streamRef },
      AFRelationship: 'Supplement',
    });
    const afRef = doc.context.register(filespec);
    const af = doc.catalog.lookup(PDFName.of('AF'));
    (af as { push(x: unknown): void }).push(afRef);
    const tampered = await doc.save({ useObjectStreams: false });

    const report = await validate(tampered);
    expect(report.issues.map((i) => i.code)).toContain('filename-not-portable');
    expect(report.ok).toBe(false);
  });
});

// Fix 4 — decode-side validation mirrors encode-side guarantees.
describe('embeddings: decode validation (fix 4)', () => {
  it('round-trips a valid space', () => {
    const decoded = decodeEmbeddings(encodeEmbeddings(sampleEmbeddings));
    expect(decoded.spaces[0]!.metric).toBe('cosine');
  });

  it('rejects a malformed space with an invalid metric from attacker CBOR', () => {
    // Hand-build CBOR that bypasses the encode-side validation.
    const malformed = cborEncode({
      'format-version': 1,
      spaces: [
        {
          model: 'evil',
          'model-revision': 'r',
          dimension: 4,
          metric: 'totally-not-a-metric',
          normalized: true,
          chunking: 'section',
          chunks: [{ id: 'a', 'text-offset': 0, 'text-length': 1, vector: new Uint8Array(16) }],
        },
      ],
    });
    expect(() => decodeEmbeddings(malformed)).toThrow(/metric/i);
  });

  it('rejects a malformed space with an invalid chunking', () => {
    const malformed = cborEncode({
      'format-version': 1,
      spaces: [
        {
          model: 'evil',
          'model-revision': 'r',
          dimension: 4,
          metric: 'cosine',
          normalized: true,
          chunking: 'invalid-chunking',
          chunks: [{ id: 'a', 'text-offset': 0, 'text-length': 1, vector: new Uint8Array(16) }],
        },
      ],
    });
    expect(() => decodeEmbeddings(malformed)).toThrow(/chunking/i);
  });
});

// Fix 5 — FlateDecode /Predictor must be rejected, not silently mis-decoded.
describe('pdf: FlateDecode /Predictor rejection (fix 5)', () => {
  it('rejects an embedded-file stream with /DecodeParms /Predictor 12', async () => {
    const cv = await pack({
      pdf: await blankPdf(),
      markdown: '# Hi\n',
      metadata: { primaryLanguage: 'en' },
    });
    const doc = await PDFDocument.load(cv, { updateMetadata: false });

    // Build a flate stream and slap a predictor on it, then add to /AF.
    const compressed = pako.deflate(new TextEncoder().encode('predicted'));
    const stream = doc.context.stream(compressed, {
      Type: 'EmbeddedFile',
      Subtype: 'text/plain',
      Filter: 'FlateDecode',
      DecodeParms: doc.context.obj({ Predictor: PDFNumber.of(12), Columns: PDFNumber.of(4) }),
    });
    const streamRef = doc.context.register(stream);
    const filespec = doc.context.obj({
      Type: 'Filespec',
      F: PDFString.of('predicted.txt'),
      UF: PDFString.of('predicted.txt'),
      EF: { F: streamRef },
      AFRelationship: 'Supplement',
    });
    const afRef = doc.context.register(filespec);
    const af = doc.catalog.lookup(PDFName.of('AF'));
    (af as { push(x: unknown): void }).push(afRef);
    const tampered = await doc.save({ useObjectStreams: false });

    await expect(validate(tampered)).rejects.toThrow(/Predictor/i);
  });
});

// Fix 6 — newer MAJOR cv:version surfaces a warning but does not block.
describe('validate: newer-format-version warning (fix 6)', () => {
  it('warns (but stays ok) when cv:version MAJOR is 2', async () => {
    const cv = await pack({
      pdf: await blankPdf(),
      markdown: '# Hi\n',
      metadata: { primaryLanguage: 'en' },
    });
    const text = new TextDecoder('latin1').decode(cv);
    expect(text).toContain('<cv:version>0.1</cv:version>');

    // Rewrite the cv:version to a future major. The XMP stream is uncompressed
    // metadata so we can patch the bytes in place (same byte length).
    const patched = patchBytes(cv, '<cv:version>0.1</cv:version>', '<cv:version>2.0</cv:version>');
    const report = await validate(patched);
    expect(report.issues.map((i) => i.code)).toContain('newer-format-version');
    const versionIssue = report.issues.find((i) => i.code === 'newer-format-version');
    expect(versionIssue?.level).toBe('warning');
    // A newer-version warning alone must not block (extraction still works).
    expect(report.ok).toBe(true);
  });

  it('does not warn for known versions 0.1 and 1.0', async () => {
    const cv = await pack({
      pdf: await blankPdf(),
      markdown: '# Hi\n',
      metadata: { primaryLanguage: 'en' },
    });
    const v10 = patchBytes(cv, '<cv:version>0.1</cv:version>', '<cv:version>1.0</cv:version>');
    const report = await validate(v10);
    expect(report.issues.map((i) => i.code)).not.toContain('newer-format-version');
  });
});

function patchBytes(bytes: Uint8Array, from: string, to: string): Uint8Array {
  if (from.length !== to.length) throw new Error('patchBytes requires equal lengths');
  const text = new TextDecoder('latin1').decode(bytes);
  const idx = text.indexOf(from);
  if (idx < 0) throw new Error(`pattern not found: ${from}`);
  const out = new Uint8Array(bytes);
  const enc = new TextEncoder().encode(to);
  out.set(enc, idx);
  return out;
}
