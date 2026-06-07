import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { pack, validate } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const CONFORMANT_FIXTURE = resolve(here, 'fixtures/python-produced.cv');

/** A PDF using the standard-14 Helvetica: referenced by name, NOT embedded. */
async function packWithNonEmbeddedFont(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Jane Doe', { x: 30, y: 350, size: 18, font });
  const pdfBytes = await pdf.save();
  return pack({ pdf: pdfBytes, markdown: '# Jane Doe\n', metadata: { primaryLanguage: 'en' } });
}

describe('PDF/A-3u in-process conformance check', () => {
  it('FAILS cv-strict on a non-embedded font instead of a false pass', async () => {
    const cv = await packWithNonEmbeddedFont();
    const report = await validate(cv, { strict: true });

    expect(report.ok).toBe(false);
    expect(report.conformance).toBe('failed');
    expect(report.issues.some((i) => i.code === 'pdfa3-font-not-embedded' && i.level === 'error')).toBe(true);
  });

  it('does not run the PDF/A check (nor falsely fail) under cv-lenient', async () => {
    const cv = await packWithNonEmbeddedFont();
    const report = await validate(cv, { strict: false });

    expect(report.ok).toBe(true);
    expect(report.conformance).toBeUndefined();
    expect(report.issues.some((i) => i.code.startsWith('pdfa3-'))).toBe(false);
  });

  it('reports structural-pass (honestly, not a full veraPDF pass) on a conformant file', async () => {
    const bytes = new Uint8Array(await readFile(CONFORMANT_FIXTURE));
    const report = await validate(bytes, { strict: true });

    expect(report.ok).toBe(true);
    expect(report.conformance).toBe('structural-pass');
    // The honest caveat is surfaced as a warning, never swallowed.
    expect(report.issues.some((i) => i.code === 'pdfa3-structural-pass' && i.level === 'warning')).toBe(true);
  });
});
