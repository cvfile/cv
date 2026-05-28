import { describe, expect, it } from 'vitest';
import { chunkMarkdown } from '../src/chunk.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function byteSlice(source: string, offset: number, length: number): string {
  return decoder.decode(encoder.encode(source).subarray(offset, offset + length));
}

const sample = `# Jane Doe

Senior engineer.

## Experience

- ACME Corp 2022 to 2026
- Initech 2018 to 2022

## Skills

TypeScript, Go, Python.
`;

describe('chunkMarkdown', () => {
  it('splits on headings by default', () => {
    const chunks = chunkMarkdown(sample);
    expect(chunks.map((c) => c.id)).toEqual(['jane-doe', 'experience', 'skills']);
  });

  it('preserves byte offsets that index back into the source', () => {
    const chunks = chunkMarkdown(sample);
    for (const c of chunks) {
      expect(byteSlice(sample, c.textOffset, c.textLength)).toBe(c.text);
    }
  });

  it('emits UTF-8 byte offsets that slice back correctly for multibyte content', () => {
    const multibyte = `# Résumé de Zoé 🚀

Ingénieure logicielle. 日本語 も少し.

## Expérience

- Société Générale, 2020 à 2024 — café ☕ inclus

## Compétences

TypeScript, Go, Python. Naïve façade.
`;
    const chunks = chunkMarkdown(multibyte);
    expect(chunks.length).toBeGreaterThan(1);
    const totalBytes = new TextEncoder().encode(multibyte).byteLength;
    for (const c of chunks) {
      // Offsets address bytes, not UTF-16 code units.
      expect(c.textOffset).toBeGreaterThanOrEqual(0);
      expect(c.textOffset + c.textLength).toBeLessThanOrEqual(totalBytes);
      expect(byteSlice(multibyte, c.textOffset, c.textLength)).toBe(c.text);
    }
    // Heading slug retains ASCII slugification of the multibyte title.
    expect(chunks[0]?.id).toBe('r-sum-de-zo');
    // First chunk's byte length exceeds its UTF-16 length because of the emoji + accents.
    const first = chunks[0];
    expect(first).toBeDefined();
    if (first) {
      expect(first.textLength).toBeGreaterThan(first.text.length);
    }
  });

  it('returns a single document chunk in document mode', () => {
    const chunks = chunkMarkdown(sample, { mode: 'document' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.text).toBe(sample);
  });

  it('returns paragraph-sized chunks in paragraph mode', () => {
    const chunks = chunkMarkdown(sample, { mode: 'paragraph' });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('falls back to a document chunk when there are no headings or paragraphs', () => {
    const chunks = chunkMarkdown('plain text', { mode: 'section' });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.id).toBe('preamble');
  });
});
