import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { pack } from '@cvfile/sdk';
import { embed, type EmbeddingBackend } from '@cvfile/embed';
import { createCvMcpServer } from '../src/server.js';

/** Deterministic 4-dim backend: "payments" texts on one axis, the rest on another. */
const fakeBackend: EmbeddingBackend = {
  model: 'test-model',
  modelRevision: 'test',
  metric: 'cosine',
  normalized: true,
  async embed(texts: string[]) {
    return {
      dimension: 4,
      vectors: texts.map((t) =>
        t.toLowerCase().includes('payments')
          ? new Float32Array([1, 0, 0, 0])
          : new Float32Array([0, 1, 0, 0]),
      ),
    };
  },
};

const PAYMENTS_MD = [
  '# Ada Lovelace',
  '',
  '## Experience',
  '',
  'Senior Go engineer building payments infrastructure.',
  '',
  '## Education',
  '',
  'Mathematics.',
].join('\n');

const DESIGN_MD = [
  '# Grace Hopper',
  '',
  '## Experience',
  '',
  'Product designer, design systems.',
].join('\n');

async function basePdf(title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([320, 240]);
  doc.setTitle(title);
  return doc.save();
}

async function writeCv(dir: string, name: string, markdown: string): Promise<string> {
  const bytes = await pack({
    pdf: await basePdf(name),
    markdown,
    json: { basics: { name } },
    embeddings: await embed(markdown, { backend: fakeBackend }),
    metadata: { primaryLanguage: 'en' },
  });
  const path = join(dir, name);
  await writeFile(path, bytes);
  return path;
}

describe('cvfile MCP server', () => {
  let dir: string;
  let client: Client;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cvfile-mcp-'));
    await writeCv(dir, 'ada.cv', PAYMENTS_MD);
    await writeCv(dir, 'grace.cv', DESIGN_MD);

    const server = createCvMcpServer({ backend: fakeBackend });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  async function callJson(name: string, args: Record<string, unknown>): Promise<any> {
    const res: any = await client.callTool({ name, arguments: args });
    expect(res.isError ?? false).toBe(false);
    return JSON.parse(res.content[0].text);
  }

  it('lists .cv files with metadata', async () => {
    const listings = await callJson('list_cvs', { directory: dir });
    expect(listings).toHaveLength(2);
    expect(listings[0].metadata.version).toBeDefined();
    expect(listings.every((l: any) => !l.error)).toBe(true);
  });

  it('validates a .cv file cleanly', async () => {
    const report = await callJson('validate_cv', { path: join(dir, 'ada.cv') });
    const errors = report.issues.filter((i: any) => i.level === 'error');
    expect(errors).toEqual([]);
  });

  it('reads markdown and json payloads', async () => {
    const md: any = await client.callTool({ name: 'read_cv', arguments: { path: join(dir, 'ada.cv') } });
    expect(md.content[0].text).toContain('payments infrastructure');

    const json: any = await client.callTool({
      name: 'read_cv',
      arguments: { path: join(dir, 'ada.cv'), part: 'json' },
    });
    expect(JSON.parse(json.content[0].text).basics.name).toBe('ada.cv');
  });

  it('ranks the payments resume first for a payments query', async () => {
    const result = await callJson('search_cvs', {
      directory: dir,
      query: 'payments experience',
      k: 3,
    });
    expect(result.model).toBe('test-model');
    expect(result.searchedFiles).toBe(2);
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0].file).toContain('ada.cv');
    expect(result.hits[0].text).toContain('payments');
    expect(result.hits[0].score).toBeGreaterThan(0.99);
  });

  it('packs a new .cv from a pdf + markdown', async () => {
    const pdfPath = join(dir, 'visual.pdf');
    const mdPath = join(dir, 'resume-src.md');
    await writeFile(pdfPath, await basePdf('Packed'));
    await writeFile(mdPath, PAYMENTS_MD);

    const out = join(dir, 'packed.cv');
    const result = await callJson('pack_cv', {
      pdfPath,
      outputPath: out,
      markdownPath: mdPath,
      embeddings: true,
    });
    expect(result.written).toBe(out);
    expect(result.metadata.primaryLanguage).toBe('en');
    expect(result.metadata.embeddings[0].model).toBe('test-model');

    const listings = await callJson('list_cvs', { directory: dir });
    expect(listings.some((l: any) => l.file === out)).toBe(true);
  });
});
