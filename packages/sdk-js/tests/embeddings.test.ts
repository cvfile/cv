import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  decodeEmbeddings,
  encodeEmbeddings,
  extractEmbeddingsParsed,
  inspect,
  pack,
  type EmbeddingsPayload,
} from '../src/index.js';

async function blankPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Sample', { x: 50, y: 350, size: 18, font });
  return pdf.save();
}

function deterministicVector(seed: number, dim: number): Float32Array {
  const out = new Float32Array(dim);
  let s = seed;
  for (let i = 0; i < dim; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return out;
}

const sampleEmbeddings: EmbeddingsPayload = {
  formatVersion: 1,
  spaces: [
    {
      model: 'BAAI/bge-m3',
      modelRevision: 'abc1234567890',
      dimension: 8,
      metric: 'cosine',
      normalized: true,
      chunking: 'section',
      chunks: [
        { id: 'header', textOffset: 0, textLength: 100, vector: deterministicVector(1, 8) },
        { id: 'experience', textOffset: 100, textLength: 500, vector: deterministicVector(2, 8) },
        { id: 'skills', textOffset: 600, textLength: 200, vector: deterministicVector(3, 8) },
      ],
    },
  ],
};

describe('embeddings CBOR round-trip', () => {
  it('encodes and decodes losslessly', () => {
    const bytes = encodeEmbeddings(sampleEmbeddings);
    const decoded = decodeEmbeddings(bytes);
    expect(decoded.formatVersion).toBe(1);
    expect(decoded.spaces).toHaveLength(1);
    const space = decoded.spaces[0]!;
    expect(space.model).toBe('BAAI/bge-m3');
    expect(space.dimension).toBe(8);
    expect(space.chunks).toHaveLength(3);
    expect(Array.from(space.chunks[0]!.vector)).toEqual(Array.from(sampleEmbeddings.spaces[0]!.chunks[0]!.vector));
  });

  it('rejects vectors of wrong dimension', () => {
    expect(() =>
      encodeEmbeddings({
        formatVersion: 1,
        spaces: [
          {
            ...sampleEmbeddings.spaces[0]!,
            chunks: [{ id: 'bad', textOffset: 0, textLength: 1, vector: new Float32Array(7) }],
          },
        ],
      }),
    ).toThrow(/dimension/);
  });
});

describe('pack/extract embeddings end-to-end', () => {
  it('embeds the CBOR inside the .cv and extracts it back', async () => {
    const pdfBytes = await blankPdf();
    const cv = await pack({
      pdf: pdfBytes,
      markdown: '# Sample\n',
      embeddings: sampleEmbeddings,
      metadata: { primaryLanguage: 'en' },
    });

    const meta = await inspect(cv);
    expect(meta.embeddings).toHaveLength(1);
    expect(meta.embeddings[0]!.model).toBe('BAAI/bge-m3');
    expect(meta.embeddings[0]!.dimension).toBe(8);
    expect(meta.embeddings[0]!.chunks).toBe(3);

    const parsed = await extractEmbeddingsParsed(cv);
    expect(parsed).not.toBeNull();
    expect(parsed!.spaces[0]!.model).toBe('BAAI/bge-m3');
    expect(Array.from(parsed!.spaces[0]!.chunks[1]!.vector)).toEqual(
      Array.from(sampleEmbeddings.spaces[0]!.chunks[1]!.vector),
    );
  });

  it('supports raw Uint8Array embeddings input', async () => {
    const pdfBytes = await blankPdf();
    const rawBytes = encodeEmbeddings(sampleEmbeddings);
    const cv = await pack({
      pdf: pdfBytes,
      markdown: '# Sample\n',
      embeddings: rawBytes,
      metadata: { primaryLanguage: 'en' },
    });
    const parsed = await extractEmbeddingsParsed(cv);
    expect(parsed!.spaces[0]!.chunks).toHaveLength(3);
  });
});
