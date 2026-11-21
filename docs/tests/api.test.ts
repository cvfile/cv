// The rules of cvfile.org's API: the MCP route answers POST only and caps the body at 16 KB, the docs tools
// return linked passages and refuse unknown paths, and only the site's own pages may post an event.

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { buildIndex } from '../server/search/siteIndex.mjs';

const ORIGIN = 'https://cvfile.org';
const PAGES = [
  { path: '/install/', url: `${ORIGIN}/install/`, title: 'Install', text: '## Python\n\npip install cvfile reads the Markdown payload.' },
  { path: '/spec/#s7', url: `${ORIGIN}/spec/#s7`, title: 'Specification 7. Security', text: 'Validators reject JavaScript and /Launch.' },
];
const PACKAGES = [
  { name: 'cvfile', registry: 'PyPI', language: 'python', install: 'pip install cvfile', summary: 'SDK', url: 'https://pypi.org/project/cvfile/', released: true, version: '0.3.2' },
  { name: '@cvfile/sdk', registry: 'npm', language: 'javascript', install: 'npm install @cvfile/sdk', summary: 'SDK', url: 'https://www.npmjs.com/package/@cvfile/sdk', released: true, version: '0.3.2' },
] as const;

const events: string[] = [];
let base = '';
const server = createServer(createApp({
  data: { index: buildIndex(PAGES), packages: [...PACKAGES] },
  origins: new Set([ORIGIN]),
  log: { call: () => undefined, search: () => undefined },
  writeEvent: (line) => events.push(line),
}));

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const MCP_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

async function callTool(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const { result } = await response.json() as { result: { content: Array<{ text: string }>; isError?: boolean } };
  return { text: result.content[0]!.text, isError: Boolean(result.isError) };
}

describe('the MCP route', () => {
  it('answers GET and DELETE with 405', async () => {
    expect((await fetch(`${base}/api/mcp`)).status).toBe(405);
    expect((await fetch(`${base}/api/mcp`, { method: 'DELETE' })).status).toBe(405);
  });

  it('refuses a body over 16 KB', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'x'.repeat(17_000) } });
    const response = await fetch(`${base}/api/mcp`, { method: 'POST', headers: MCP_HEADERS, body });
    expect(response.status).toBe(413);
  });

  it('returns passages with the url to link', async () => {
    const hits = JSON.parse((await callTool('search_docs', { query: 'Markdown payload Python' })).text);
    expect(hits[0]).toMatchObject({ path: '/install/', url: `${ORIGIN}/install/` });
  });

  it('refuses a path outside the index', async () => {
    expect((await callTool('read_doc_page', { path: '/etc/passwd' })).isError).toBe(true);
  });

  it('lists the packages of the language asked for', async () => {
    const packages = JSON.parse((await callTool('list_packages', { language: 'python' })).text);
    expect(packages.map((entry: { name: string }) => entry.name)).toEqual(['cvfile']);
  });
});

describe('the events route', () => {
  const post = (origin: string, event: string) => fetch(`${base}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ event }),
  });

  it('counts a known event from the site', async () => {
    expect((await post(ORIGIN, 'cv_built')).status).toBe(204);
    expect(events.at(-1)).toContain('"event":"cv_built"');
  });

  it('refuses another origin and an unknown event', async () => {
    expect((await post('https://attacker.example', 'cv_built')).status).toBe(403);
    expect((await post(ORIGIN, 'page_view')).status).toBe(400);
  });
});
