/**
 * Section-based markdown chunker.
 *
 * Splits a markdown document on ATX headings (`#`, `##`, ...). Each chunk
 * carries the byte offset and length into the original UTF-8 source so a
 * downstream consumer can map a vector hit back to the exact substring
 * without re-tokenising. Pre-heading content becomes a "preamble" chunk.
 *
 * Per spec §5.1, `textOffset`/`textLength` are UTF-8 *byte* offsets into the
 * markdown source. We encode the document once with `TextEncoder`, track a
 * byte cursor while iterating lines (counting the trailing `\n` byte), and
 * derive each chunk's `text` by decoding the corresponding byte slice. This
 * keeps the offsets in agreement with the Go and Python SDKs for any
 * non-ASCII résumé.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

/** A source line plus its UTF-8 byte offset and byte length (including any trailing `\n`). */
interface ByteLine {
  text: string;
  offset: number;
  byteLength: number;
}

export function chunkMarkdown(markdown: string, opts: ChunkOptions = {}): MarkdownChunk[] {
  const mode = opts.mode ?? 'section';
  const bytes = encoder.encode(markdown);
  if (mode === 'document') {
    return [documentChunk(bytes)];
  }
  if (mode === 'paragraph') {
    return paragraphChunks(bytes);
  }
  return sectionChunks(bytes);
}

function documentChunk(bytes: Uint8Array): MarkdownChunk {
  return { id: 'document', textOffset: 0, textLength: bytes.byteLength, text: sliceText(bytes, 0, bytes.byteLength) };
}

function sectionChunks(bytes: Uint8Array): MarkdownChunk[] {
  const lines = splitWithByteOffsets(bytes);
  const sections: MarkdownChunk[] = [];
  let current: { id: string; start: number; end: number } | null = null;
  const ids = new Set<string>();

  function flush(end: number): void {
    if (!current) return;
    const text = sliceText(bytes, current.start, end);
    if (text.trim().length === 0) {
      current = null;
      return;
    }
    sections.push({ id: current.id, textOffset: current.start, textLength: end - current.start, text });
    current = null;
  }

  for (const line of lines) {
    const match = HEADING.exec(line.text);
    const lineEnd = line.offset + line.byteLength;
    if (match) {
      flush(line.offset);
      const id = uniqueId(slugify(match[2] ?? `section-${sections.length + 1}`), ids);
      ids.add(id);
      current = { id, start: line.offset, end: lineEnd };
      continue;
    }
    if (current === null) {
      const id = uniqueId('preamble', ids);
      ids.add(id);
      current = { id, start: line.offset, end: lineEnd };
    } else {
      current.end = lineEnd;
    }
  }
  flush(bytes.byteLength);

  if (sections.length === 0) {
    return [documentChunk(bytes)];
  }
  return sections;
}

function paragraphChunks(bytes: Uint8Array): MarkdownChunk[] {
  const out: MarkdownChunk[] = [];
  const ids = new Set<string>();
  const separator = encoder.encode('\n\n');
  let cursor = 0;
  let i = 0;
  while (cursor < bytes.byteLength) {
    let end = indexOfBytes(bytes, separator, cursor);
    if (end === -1) end = bytes.byteLength;
    const text = sliceText(bytes, cursor, end);
    if (text.trim().length > 0) {
      const id = uniqueId(slugify(text.split('\n')[0] ?? `p-${i}`), ids);
      ids.add(id);
      out.push({ id, textOffset: cursor, textLength: end - cursor, text });
      i += 1;
    }
    cursor = end + separator.byteLength;
  }
  if (out.length === 0) {
    return [documentChunk(bytes)];
  }
  return out;
}

/** Decode the UTF-8 byte slice `[start, end)` back into a string. */
function sliceText(bytes: Uint8Array, start: number, end: number): string {
  return decoder.decode(bytes.subarray(start, end));
}

/** Split UTF-8 bytes into lines, each tagged with its byte offset and byte length (newline included). */
function splitWithByteOffsets(bytes: Uint8Array): ByteLine[] {
  const newline = 0x0a; // '\n'
  const lines: ByteLine[] = [];
  let start = 0;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    if (bytes[i] === newline) {
      const byteLength = i - start + 1;
      lines.push({ text: sliceText(bytes, start, i + 1), offset: start, byteLength });
      start = i + 1;
    }
  }
  if (start < bytes.byteLength) {
    lines.push({ text: sliceText(bytes, start, bytes.byteLength), offset: start, byteLength: bytes.byteLength - start });
  }
  return lines;
}

/** Find the byte index of `needle` in `haystack` at or after `from`, or -1. */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  const last = haystack.byteLength - needle.byteLength;
  for (let i = from; i <= last; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.byteLength; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
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
