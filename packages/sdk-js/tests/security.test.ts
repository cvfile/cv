import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { CvError, extract, pack, validate } from '../src/index.js';
import { DEFAULT_MAX_PAYLOAD_BYTES } from '../src/validate.js';

async function makeMinimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.drawText('cv-security-test');
  return doc.save();
}

const here = dirname(fileURLToPath(import.meta.url));
const malDir = join(here, '..', '..', '..', 'spec', 'test-vectors', 'malicious');

interface ManifestEntry {
  filename: string;
  expectedCode: string;
  description: string;
}

interface Manifest {
  fixtures: ManifestEntry[];
}

async function loadManifest(): Promise<Manifest> {
  const raw = await readFile(join(malDir, 'manifest.json'), 'utf8');
  return JSON.parse(raw) as Manifest;
}

describe('security: forbidden constructs', () => {
  it('rejects every malicious fixture and reports the documented error code', async () => {
    const manifest = await loadManifest();
    expect(manifest.fixtures.length).toBeGreaterThan(0);

    for (const fixture of manifest.fixtures) {
      const bytes = await readFile(join(malDir, fixture.filename));
      const report = await validate(bytes);
      const codes = report.issues.map((i) => i.code);
      expect(report.ok, `${fixture.filename}: ${fixture.description}\nissues: ${JSON.stringify(report.issues, null, 2)}`).toBe(false);
      expect(codes, `${fixture.filename} expected code "${fixture.expectedCode}", got: ${codes.join(', ')}`).toContain(fixture.expectedCode);
    }
  });
});

describe('security: payload size cap', () => {
  it('rejects payloads larger than the configured cap', async () => {
    // 5 MiB markdown — under default cap, over a 1 MiB override.
    const bigMarkdown = '# Big\n\n' + 'x'.repeat(5 * 1024 * 1024);
    const baseDoc = await makeMinimalPdf();

    const repacked = await pack({
      pdf: baseDoc,
      markdown: bigMarkdown,
      metadata: {
        primaryLanguage: 'en',
        primaryPayload: 'resume.md',
        generator: 'cv-security-test',
      },
    });

    const passReport = await validate(repacked);
    expect(passReport.ok).toBe(true);
    expect(DEFAULT_MAX_PAYLOAD_BYTES).toBeGreaterThanOrEqual(16 * 1024 * 1024);

    const failReport = await validate(repacked, { maxPayloadBytes: 1024 * 1024 });
    expect(failReport.ok).toBe(false);
    const tooLarge = failReport.issues.find((i) => i.code === 'payload-too-large');
    expect(tooLarge).toBeDefined();
    expect(tooLarge?.payload).toBe('resume.md');
  });
});

describe('security: decompression bomb', () => {
  // Highly repetitive content: inflates past the 16 MiB default cap but
  // FlateDecode-compresses to a few kilobytes inside the PDF, i.e. a bomb.
  const BOMB_MARKDOWN = '# Bomb\n\n' + 'x'.repeat(20 * 1024 * 1024);
  const HIGHER_CAP = 32 * 1024 * 1024;
  let bombFile: Uint8Array;

  beforeAll(async () => {
    bombFile = await pack({
      pdf: await makeMinimalPdf(),
      markdown: BOMB_MARKDOWN,
      metadata: {
        primaryLanguage: 'en',
        primaryPayload: 'resume.md',
        generator: 'cv-security-test',
      },
    });
    // The whole point of a bomb: the file on disk stays far below the cap.
    expect(bombFile.length).toBeLessThan(1024 * 1024);
  });

  it('validate reports payload-too-large as an issue, without a misleading integrity error', async () => {
    const report = await validate(bombFile);
    expect(report.ok).toBe(false);
    const tooLarge = report.issues.find((i) => i.code === 'payload-too-large');
    expect(tooLarge).toBeDefined();
    expect(tooLarge?.payload).toBe('resume.md');
    // Bytes are discarded at the cap, so no bogus digest mismatch is emitted.
    expect(report.issues.some((i) => i.code === 'integrity-mismatch')).toBe(false);
  });

  it('extract rejects with a typed CvError carrying the code and payload name', async () => {
    const err = await extract(bombFile).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CvError);
    expect((err as CvError).code).toBe('payload-too-large');
    expect((err as CvError).payload).toBe('resume.md');
  });

  it('an explicit higher cap allows the payload through both validate and extract', async () => {
    const report = await validate(bombFile, { maxPayloadBytes: HIGHER_CAP });
    expect(report.ok).toBe(true);

    const file = await extract(bombFile, { maxPayloadBytes: HIGHER_CAP });
    const md = file.payloads.find((p) => p.name === 'resume.md');
    expect(md?.text()).toBe(BOMB_MARKDOWN);
  });

  it('a legitimate file under the cap still round-trips through extract', async () => {
    const markdown = '# Fine\n\nA normal resume.';
    const packed = await pack({
      pdf: await makeMinimalPdf(),
      markdown,
      metadata: {
        primaryLanguage: 'en',
        primaryPayload: 'resume.md',
        generator: 'cv-security-test',
      },
    });
    const file = await extract(packed);
    expect(file.payloads.find((p) => p.name === 'resume.md')?.text()).toBe(markdown);
  });
});
