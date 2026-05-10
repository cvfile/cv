import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extract, extractHtml, extractMarkdown, inspect, isCvFile, validate } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/python-produced.cv');

const PY_MD = `# Marie Curie

Physicist and chemist  ·  Paris, France

## Notable

* Discovered polonium and radium
* Two Nobel Prizes (Physics 1903, Chemistry 1911)
`;

const PY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Marie Curie</title></head>
<body><h1>Marie Curie</h1><p>Physicist and chemist.</p></body></html>`;

describe('JS reads Python-produced .cv (interop)', () => {
  it('detects the file as a .cv', async () => {
    const bytes = new Uint8Array(await readFile(FIXTURE));
    expect(await isCvFile(bytes)).toBe(true);
  });

  it('inspects the metadata', async () => {
    const bytes = new Uint8Array(await readFile(FIXTURE));
    const meta = await inspect(bytes);
    expect(meta.version).toBe('0.1');
    expect(meta.primaryLanguage).toBe('en');
    expect(meta.primaryPayload).toBe('resume.md');
    expect(meta.generator).toContain('cvfile-py-examples');
    expect(meta.integrity.length).toBeGreaterThan(0);
  });

  it('extracts markdown byte-identical to source', async () => {
    const bytes = new Uint8Array(await readFile(FIXTURE));
    expect(await extractMarkdown(bytes)).toBe(PY_MD);
  });

  it('extracts html byte-identical to source', async () => {
    const bytes = new Uint8Array(await readFile(FIXTURE));
    expect(await extractHtml(bytes)).toBe(PY_HTML);
  });

  it('extracts all three Python-produced payloads', async () => {
    const bytes = new Uint8Array(await readFile(FIXTURE));
    const file = await extract(bytes);
    const names = file.payloads.map((p) => p.name).sort();
    expect(names).toEqual(['resume.html', 'resume.json', 'resume.md']);
  });

  it('validates the Python-produced file', async () => {
    const bytes = new Uint8Array(await readFile(FIXTURE));
    const report = await validate(bytes);
    expect(report.ok).toBe(true);
  });
});
