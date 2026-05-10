import { describe, expect, it } from 'vitest';
import { chunkMarkdown } from '../src/chunk.js';

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
      const slice = sample.slice(c.textOffset, c.textOffset + c.textLength);
      expect(slice).toBe(c.text);
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
