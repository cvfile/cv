import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CvError, extract, validate } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const validDir = join(here, '..', '..', '..', 'spec', 'test-vectors', 'valid');

interface ManifestEntry {
  filename: string;
  expected: 'valid' | 'warning' | 'error';
  expectedCode?: string;
  description: string;
  primaryPayload?: string;
  primaryLanguage?: string;
  payloadNames?: string[];
}

interface Manifest {
  fixtures: ManifestEntry[];
}

async function loadManifest(): Promise<Manifest> {
  const raw = await readFile(join(validDir, 'manifest.json'), 'utf8');
  return JSON.parse(raw) as Manifest;
}

async function loadFixture(entry: ManifestEntry): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(validDir, entry.filename)));
}

describe('valid-vector corpus', () => {
  it('accepts every valid fixture and round-trips it through extract', async () => {
    const manifest = await loadManifest();
    const positives = manifest.fixtures.filter((f) => f.expected === 'valid');
    expect(positives.length).toBeGreaterThan(0);

    for (const fixture of positives) {
      const bytes = await loadFixture(fixture);
      const report = await validate(bytes);
      expect(report.ok, `${fixture.filename}: ${JSON.stringify(report.issues, null, 2)}`).toBe(true);
      expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);

      const file = await extract(bytes);
      expect(file.metadata.primaryPayload).toBe(fixture.primaryPayload);
      expect(file.metadata.primaryLanguage).toBe(fixture.primaryLanguage);
      expect(file.payloads.map((p) => p.name).sort()).toEqual([...(fixture.payloadNames ?? [])].sort());
      const primary = file.payloads.find((p) => p.name === fixture.primaryPayload);
      expect(primary, `${fixture.filename}: primary payload missing from extract()`).toBeDefined();
      expect(primary!.text().length).toBeGreaterThan(0);
    }
  });

  it('surfaces the documented warning without failing validation or blocking extraction', async () => {
    const manifest = await loadManifest();
    const warnings = manifest.fixtures.filter((f) => f.expected === 'warning');
    expect(warnings.length).toBeGreaterThan(0);

    for (const fixture of warnings) {
      const bytes = await loadFixture(fixture);
      const report = await validate(bytes);
      expect(report.ok, `${fixture.filename}: ${JSON.stringify(report.issues, null, 2)}`).toBe(true);
      const warning = report.issues.find((i) => i.code === fixture.expectedCode);
      expect(warning, `${fixture.filename} expected warning "${fixture.expectedCode}"`).toBeDefined();
      expect(warning!.level).toBe('warning');

      // Spec §8.3: payloads MUST NOT be dropped from extraction APIs.
      const file = await extract(bytes);
      expect(file.payloads.map((p) => p.name).sort()).toEqual([...(fixture.payloadNames ?? [])].sort());
    }
  });

  it('rejects every negative fixture with the documented issue code', async () => {
    const manifest = await loadManifest();
    const negatives = manifest.fixtures.filter((f) => f.expected === 'error');
    expect(negatives.length).toBeGreaterThan(0);

    for (const fixture of negatives) {
      const bytes = await loadFixture(fixture);
      const report = await validate(bytes);
      const codes = report.issues.map((i) => i.code);
      expect(report.ok, `${fixture.filename}: ${fixture.description}`).toBe(false);
      expect(codes, `${fixture.filename} expected code "${fixture.expectedCode}", got: ${codes.join(', ')}`).toContain(
        fixture.expectedCode,
      );
    }
  });

  it('extract rejects the oversized fixture with a typed payload-too-large error', async () => {
    const manifest = await loadManifest();
    const oversized = manifest.fixtures.find((f) => f.expectedCode === 'payload-too-large');
    expect(oversized).toBeDefined();

    const bytes = await loadFixture(oversized!);
    const err = await extract(bytes).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CvError);
    expect((err as CvError).code).toBe('payload-too-large');
  });
});
