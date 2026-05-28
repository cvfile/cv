import { createServer, type Server } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pack } from '@cvfile/sdk';
import { cvHandler } from '../src/handler.js';

const SAMPLE_MD = `# Jane Doe\n\nSenior software engineer.\n`;
const SAMPLE_HTML = `<!doctype html><html><body><h1>Jane Doe</h1></body></html>`;

let server: Server;
let baseUrl: string;
let tmpRoot: string;

async function makeBlankPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Sample CV', { x: 30, y: 350, size: 18, font });
  return pdf.save();
}

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'cv-handler-'));
  const pdfBytes = await makeBlankPdf();
  const cvBytes = await pack({
    pdf: pdfBytes,
    markdown: SAMPLE_MD,
    html: SAMPLE_HTML,
    metadata: { primaryLanguage: 'en' },
  });
  await writeFile(join(tmpRoot, 'jane.cv'), cvBytes);

  const handler = cvHandler({ root: tmpRoot });
  server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (typeof addr !== 'object' || !addr) throw new Error('no address');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('cvHandler over HTTP', () => {
  it('serves PDF bytes by default', async () => {
    const res = await fetch(`${baseUrl}/jane.cv`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.cv+pdf');
    expect(res.headers.get('vary')).toBe('Accept, Accept-Language');
    expect(res.headers.get('link')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="jane.cv"');
    expect(res.headers.get('etag')).toMatch(/^W\/"pdf-/);
    expect(res.headers.get('last-modified')).toBeTruthy();
    const body = new Uint8Array(await res.arrayBuffer());
    const header = new TextDecoder().decode(body.slice(0, 4));
    expect(header).toBe('%PDF');
  });

  it('serves PDF for a real browser Accept (text/html + */*)', async () => {
    const res = await fetch(`${baseUrl}/jane.cv`, {
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.cv+pdf');
    const body = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(body.slice(0, 4))).toBe('%PDF');
  });

  it('q=0 markdown falls through to PDF', async () => {
    const res = await fetch(`${baseUrl}/jane.cv`, { headers: { accept: 'text/markdown;q=0' } });
    expect(res.headers.get('content-type')).toBe('application/vnd.cv+pdf');
  });

  it('serves markdown when Accept is text/markdown', async () => {
    const res = await fetch(`${baseUrl}/jane.cv`, { headers: { accept: 'text/markdown' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')!).toContain('text/markdown');
    const body = await res.text();
    expect(body).toBe(SAMPLE_MD);
  });

  it('serves html when Accept is text/html', async () => {
    const res = await fetch(`${baseUrl}/jane.cv`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')!).toContain('text/html');
    const body = await res.text();
    expect(body).toBe(SAMPLE_HTML);
  });

  it('?format=md wins over Accept', async () => {
    const res = await fetch(`${baseUrl}/jane.cv?format=md`, { headers: { accept: 'application/pdf' } });
    expect(res.headers.get('content-type')!).toContain('text/markdown');
    expect(await res.text()).toBe(SAMPLE_MD);
  });

  it('markdown Content-Type carries no cv-language parameter', async () => {
    const res = await fetch(`${baseUrl}/jane.cv`, { headers: { accept: 'text/markdown' } });
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
  });

  it('ETag varies by negotiated format', async () => {
    const pdf = await fetch(`${baseUrl}/jane.cv`);
    const md = await fetch(`${baseUrl}/jane.cv`, { headers: { accept: 'text/markdown' } });
    expect(pdf.headers.get('etag')).not.toBe(md.headers.get('etag'));
    await pdf.arrayBuffer();
    await md.text();
  });

  it('honors If-None-Match with a 304', async () => {
    const first = await fetch(`${baseUrl}/jane.cv`, { headers: { accept: 'text/markdown' } });
    const etag = first.headers.get('etag')!;
    await first.text();
    const second = await fetch(`${baseUrl}/jane.cv`, {
      headers: { accept: 'text/markdown', 'if-none-match': etag },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get('etag')).toBe(etag);
    expect(await second.text()).toBe('');
  });

  it('honors If-Modified-Since with a 304', async () => {
    const first = await fetch(`${baseUrl}/jane.cv`);
    const lastModified = first.headers.get('last-modified')!;
    await first.arrayBuffer();
    const second = await fetch(`${baseUrl}/jane.cv`, { headers: { 'if-modified-since': lastModified } });
    expect(second.status).toBe(304);
  });

  it('returns 404 for missing file', async () => {
    const res = await fetch(`${baseUrl}/nope.cv`);
    expect(res.status).toBe(404);
  });

  it('blocks path traversal', async () => {
    const res = await fetch(`${baseUrl}/../../../etc/passwd`);
    expect([404, 415]).toContain(res.status);
  });
});

describe('Content-Disposition sanitization', () => {
  let injServer: Server;
  let injBase: string;
  let cvBytes: Uint8Array;

  beforeAll(async () => {
    cvBytes = await pack({
      pdf: await makeBlankPdf(),
      markdown: SAMPLE_MD,
      html: SAMPLE_HTML,
      metadata: { primaryLanguage: 'en' },
    });
    const handler = cvHandler({ loader: async () => cvBytes });
    injServer = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => injServer.listen(0, '127.0.0.1', resolve));
    const addr = injServer.address();
    if (typeof addr !== 'object' || !addr) throw new Error('no address');
    injBase = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => injServer.close(() => resolve()));
  });

  it('strips quotes from the filename', async () => {
    const res = await fetch(`${injBase}/a%22b.cv`);
    const cd = res.headers.get('content-disposition')!;
    expect(cd).toBe('inline; filename="ab.cv"');
    expect(cd).not.toContain('a"b');
    await res.arrayBuffer();
  });

  it('emits RFC 5987 filename* for non-ASCII names', async () => {
    const res = await fetch(`${injBase}/${encodeURIComponent('café')}.cv`);
    const cd = res.headers.get('content-disposition')!;
    expect(cd).toContain("filename*=UTF-8''caf%C3%A9.cv");
    await res.arrayBuffer();
  });

  it('never lets CR/LF reach the header value', async () => {
    // %0d%0a in the path would be header-injection if interpolated raw.
    const res = await fetch(`${injBase}/a%0d%0aX-Injected:1b.cv`);
    const cd = res.headers.get('content-disposition')!;
    expect(cd).not.toMatch(/[\r\n]/);
    expect(res.headers.get('x-injected')).toBeNull();
    await res.arrayBuffer();
  });
});

describe('defaultFormat as final fallback', () => {
  let mdServer: Server;
  let mdBase: string;

  beforeAll(async () => {
    const handler = cvHandler({ root: tmpRoot, defaultFormat: 'markdown' });
    mdServer = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => mdServer.listen(0, '127.0.0.1', resolve));
    const addr = mdServer.address();
    if (typeof addr !== 'object' || !addr) throw new Error('no address');
    mdBase = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mdServer.close(() => resolve()));
  });

  it('does not override an explicit Accept', async () => {
    const res = await fetch(`${mdBase}/jane.cv`, { headers: { accept: 'application/pdf' } });
    expect(res.headers.get('content-type')).toBe('application/vnd.cv+pdf');
    await res.arrayBuffer();
  });

  it('applies when there is no usable Accept', async () => {
    const res = await fetch(`${mdBase}/jane.cv`, { headers: { accept: '' } });
    expect(res.headers.get('content-type')).toContain('text/markdown');
    await res.text();
  });
});
