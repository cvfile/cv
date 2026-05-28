import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { detect, unwrap } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, '..', '..', '..', '..', 'packages', 'sdk-js', 'tests', 'fixtures', 'python-produced.cv');

async function loadFixture(): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(FIXTURE));
  } catch {
    return null;
  }
}

describe('detect', () => {
  it('recognises a .cv file', async () => {
    const data = await loadFixture();
    if (!data) return;
    const det = detect(data);
    expect(det.isCvFile).toBe(true);
    expect(det.version).toBeTruthy();
    expect(det.primaryPayload).toBe('resume.md');
    expect(det.primaryLanguage).toBeTruthy();
  });

  it('rejects plain PDF', () => {
    const plain = new TextEncoder().encode(
      '%PDF-1.7\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\n%%EOF',
    );
    expect(detect(plain).isCvFile).toBe(false);
  });

  it('rejects garbage', () => {
    expect(detect(new TextEncoder().encode('hello world')).isCvFile).toBe(false);
  });

  it('detects RDF attribute-form XMP', () => {
    // Fields serialised as attributes on rdf:Description rather than as
    // child elements.
    const xmp = new TextEncoder().encode(
      [
        '%PDF-1.7',
        '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
        '<rdf:Description rdf:about="" xmlns:cv="http://ns.cvfile.org/cv/1.0/"',
        '  cv:version="1.0"',
        '  cv:primaryPayload="resume.md"',
        '  cv:primaryLanguage="en"',
        '  cv:generator="cvfile.org/create"/>',
        '</rdf:RDF>',
        '</x:xmpmeta>',
        '<?xpacket end="w"?>',
        '%%EOF',
      ].join('\n'),
    );
    const det = detect(xmp);
    expect(det.isCvFile).toBe(true);
    expect(det.version).toBe('1.0');
    expect(det.primaryPayload).toBe('resume.md');
    expect(det.primaryLanguage).toBe('en');
    expect(det.generator).toBe('cvfile.org/create');
  });
});

describe('unwrap', () => {
  it('returns the primary markdown payload', async () => {
    const data = await loadFixture();
    if (!data) return;
    const payload = await unwrap(data);
    expect(payload).not.toBeNull();
    expect(payload!.name).toBe('resume.md');
    expect(payload!.mimeType).toBe('text/markdown');
    expect(new TextDecoder().decode(payload!.bytes).trim().length).toBeGreaterThan(0);
  });

  it('returns a specific payload by name', async () => {
    const data = await loadFixture();
    if (!data) return;
    const payload = await unwrap(data, 'resume.html');
    expect(payload).not.toBeNull();
    expect(payload!.name).toBe('resume.html');
    expect(payload!.mimeType).toBe('text/html');
  });

  it('returns null for a missing payload', async () => {
    const data = await loadFixture();
    if (!data) return;
    expect(await unwrap(data, 'does-not-exist.txt')).toBeNull();
  });

  it('returns null for a non-cv PDF', async () => {
    const plain = new TextEncoder().encode('%PDF-1.7\n%%EOF');
    expect(await unwrap(plain)).toBeNull();
  });
});
