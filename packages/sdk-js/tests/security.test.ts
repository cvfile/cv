import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pack, validate } from '../src/index.js';
import { DEFAULT_MAX_PAYLOAD_BYTES } from '../src/validate.js';

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
    const baseFile = await readFile(join(here, '..', 'examples', 'out', 'jane-doe.cv'));
    const baseDoc = await readFile(join(here, '..', 'examples', 'out', 'jane-doe.pdf'));
    void baseFile;

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
