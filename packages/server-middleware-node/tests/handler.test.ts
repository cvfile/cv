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
    const body = new Uint8Array(await res.arrayBuffer());
    const header = new TextDecoder().decode(body.slice(0, 4));
    expect(header).toBe('%PDF');
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

  it('returns 404 for missing file', async () => {
    const res = await fetch(`${baseUrl}/nope.cv`);
    expect(res.status).toBe(404);
  });

  it('blocks path traversal', async () => {
    const res = await fetch(`${baseUrl}/../../../etc/passwd`);
    expect([404, 415]).toContain(res.status);
  });
});
