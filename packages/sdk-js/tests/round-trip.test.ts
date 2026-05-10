import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { extract, extractHtml, extractMarkdown, inspect, isCvFile, pack, validate } from '../src/index.js';

async function makeBlankPdf(text = 'Sample CV'): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 400]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 30, y: 350, size: 18, font });
  return pdf.save();
}

const SAMPLE_MD = `# Jane Doe

Senior software engineer.

## Experience

- ACME Corp 2022—2026
- Initech 2018—2022
`;

const SAMPLE_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Jane Doe</title></head>
<body>
<h1>Jane Doe</h1>
<p>Senior software engineer.</p>
</body>
</html>`;

describe('pack → extract round-trip', () => {
  it('round-trips markdown bytes identically', async () => {
    const pdfBytes = await makeBlankPdf();
    const cv = await pack({
      pdf: pdfBytes,
      markdown: SAMPLE_MD,
      metadata: { primaryLanguage: 'en' },
    });

    expect(cv).toBeInstanceOf(Uint8Array);
    expect(cv.length).toBeGreaterThan(pdfBytes.length);

    const md = await extractMarkdown(cv);
    expect(md).toBe(SAMPLE_MD);
  });

  it('round-trips html bytes identically', async () => {
    const pdfBytes = await makeBlankPdf();
    const cv = await pack({
      pdf: pdfBytes,
      html: SAMPLE_HTML,
      metadata: { primaryLanguage: 'en' },
    });

    const html = await extractHtml(cv);
    expect(html).toBe(SAMPLE_HTML);
  });

  it('carries multiple payloads and reports them in metadata', async () => {
    const pdfBytes = await makeBlankPdf();
    const cv = await pack({
      pdf: pdfBytes,
      markdown: SAMPLE_MD,
      html: SAMPLE_HTML,
      json: { basics: { name: 'Jane Doe' } },
      metadata: { primaryLanguage: 'en' },
    });

    const file = await extract(cv);
    expect(file.payloads).toHaveLength(3);
    expect(file.payloads.map((p) => p.name).sort()).toEqual(['resume.html', 'resume.json', 'resume.md']);
    expect(file.metadata.primaryPayload).toBe('resume.md');
    expect(file.metadata.primaryLanguage).toBe('en');
  });

  it('inspect returns metadata without extracting payloads', async () => {
    const pdfBytes = await makeBlankPdf();
    const cv = await pack({
      pdf: pdfBytes,
      markdown: SAMPLE_MD,
      metadata: { primaryLanguage: 'fr', generator: 'test/1.0' },
    });

    const meta = await inspect(cv);
    expect(meta.version).toBe('0.1');
    expect(meta.primaryLanguage).toBe('fr');
    expect(meta.generator).toBe('test/1.0');
    expect(meta.integrity).toHaveLength(1);
    expect(meta.integrity[0]!.algorithm).toBe('sha-256');
    expect(meta.integrity[0]!.payload).toBe('resume.md');
  });
});

describe('isCvFile', () => {
  it('returns false for a plain PDF', async () => {
    const pdfBytes = await makeBlankPdf();
    expect(await isCvFile(pdfBytes)).toBe(false);
  });

  it('returns true for a packed .cv file', async () => {
    const pdfBytes = await makeBlankPdf();
    const cv = await pack({
      pdf: pdfBytes,
      markdown: SAMPLE_MD,
      metadata: { primaryLanguage: 'en' },
    });
    expect(await isCvFile(cv)).toBe(true);
  });
});

describe('validate', () => {
  it('passes a freshly packed file in lenient mode', async () => {
    const pdfBytes = await makeBlankPdf();
    const cv = await pack({
      pdf: pdfBytes,
      markdown: SAMPLE_MD,
      metadata: { primaryLanguage: 'en' },
    });
    const report = await validate(cv);
    expect(report.ok).toBe(true);
    expect(report.level).toBe('cv-lenient');
  });

  it('detects integrity tampering when XMP digest is wrong', async () => {
    const pdfBytes = await makeBlankPdf();
    const cv = await pack({
      pdf: pdfBytes,
      markdown: SAMPLE_MD,
      metadata: { primaryLanguage: 'en' },
    });

    const tampered = new Uint8Array(cv);
    const opening = new TextEncoder().encode('&quot;digest&quot;:&quot;');
    const idx = indexOfBytes(tampered, opening);
    expect(idx).toBeGreaterThan(-1);
    const firstHexCharIdx = idx + opening.length;
    tampered[firstHexCharIdx] = tampered[firstHexCharIdx] === 0x30 ? 0x31 : 0x30;

    const report = await validate(tampered);
    const hasIntegrityIssue = report.issues.some((i) => i.code === 'integrity-mismatch');
    expect(hasIntegrityIssue).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('rejects a plain PDF', async () => {
    const pdfBytes = await makeBlankPdf();
    const report = await validate(pdfBytes);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'no-xmp')).toBe(true);
  });
});

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

