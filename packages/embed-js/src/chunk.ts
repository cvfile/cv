/**
 * Section-based markdown chunker.
 *
 * Splits a markdown document on ATX headings (`#`, `##`, ...). Each chunk
 * carries the byte offset and length into the original UTF-8 source so a
 * downstream consumer can map a vector hit back to the exact substring
 * without re-tokenising. Pre-heading content becomes a "preamble" chunk.
 */

export type ChunkingMode = 'document' | 'section' | 'paragraph';

export interface MarkdownChunk {
  id: string;
  textOffset: number;
  textLength: number;
  text: string;
}

export interface ChunkOptions {
  mode?: ChunkingMode;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;

export function chunkMarkdown(markdown: string, opts: ChunkOptions = {}): MarkdownChunk[] {
  const mode = opts.mode ?? 'section';
  if (mode === 'document') {
    return [{ id: 'document', textOffset: 0, textLength: markdown.length, text: markdown }];
  }
  if (mode === 'paragraph') {
    return paragraphChunks(markdown);
  }
  return sectionChunks(markdown);
}

function sectionChunks(markdown: string): MarkdownChunk[] {
  const lines = splitWithOffsets(markdown);
  const sections: MarkdownChunk[] = [];
  let current: { id: string; start: number; end: number } | null = null;
  const ids = new Set<string>();

  function flush(end: number): void {
    if (!current) return;
    const text = markdown.slice(current.start, end);
    if (text.trim().length === 0) {
      current = null;
      return;
    }
    sections.push({ id: current.id, textOffset: current.start, textLength: end - current.start, text });
    current = null;
  }

  for (const line of lines) {
    const match = HEADING.exec(line.text);
    if (match) {
      flush(line.offset);
      const id = uniqueId(slugify(match[2] ?? `section-${sections.length + 1}`), ids);
      ids.add(id);
      current = { id, start: line.offset, end: line.offset + line.text.length };
      continue;
    }
    if (current === null) {
      const id = uniqueId('preamble', ids);
      ids.add(id);
      current = { id, start: line.offset, end: line.offset + line.text.length };
    } else {
      current.end = line.offset + line.text.length;
    }
  }
  flush(markdown.length);

  if (sections.length === 0) {
    return [{ id: 'document', textOffset: 0, textLength: markdown.length, text: markdown }];
  }
  return sections;
}

function paragraphChunks(markdown: string): MarkdownChunk[] {
  const out: MarkdownChunk[] = [];
  const ids = new Set<string>();
  let cursor = 0;
  let i = 0;
  while (cursor < markdown.length) {
    let end = markdown.indexOf('\n\n', cursor);
    if (end === -1) end = markdown.length;
    const text = markdown.slice(cursor, end);
    if (text.trim().length > 0) {
      const id = uniqueId(slugify(text.split('\n')[0] ?? `p-${i}`), ids);
      ids.add(id);
      out.push({ id, textOffset: cursor, textLength: text.length, text });
      i += 1;
    }
    cursor = end + 2;
  }
  if (out.length === 0) {
    return [{ id: 'document', textOffset: 0, textLength: markdown.length, text: markdown }];
  }
  return out;
}

function splitWithOffsets(s: string): { text: string; offset: number }[] {
  const lines: { text: string; offset: number }[] = [];
  let offset = 0;
  for (const line of s.split('\n')) {
    const withNl = line + (offset + line.length < s.length ? '\n' : '');
    lines.push({ text: withNl, offset });
    offset += withNl.length;
  }
  return lines;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'section'
  );
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
