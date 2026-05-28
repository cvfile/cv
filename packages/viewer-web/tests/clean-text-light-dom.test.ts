import { describe, expect, it, beforeAll } from 'vitest';
import type { CvFile, ExtractedPayload } from '@cvfile/sdk';
import { CvEmbed } from '../src/cv-embed.js';

function payload(mimeType: string, language: string, text: string): ExtractedPayload {
  return {
    name: `${language}.${mimeType}`,
    mimeType,
    language,
    relationship: 'Alternative',
    bytes: new TextEncoder().encode(text),
    text: () => text,
  };
}

function makeFile(primaryLanguage: string, payloads: ExtractedPayload[]): CvFile {
  return {
    bytes: new Uint8Array(),
    metadata: {
      version: '1.0',
      primaryLanguage,
      primaryPayload: 'resume.md',
      alternates: [],
      integrity: [],
      embeddings: [],
    },
    payloads,
  };
}

beforeAll(() => {
  if (!customElements.get('cv-embed')) {
    customElements.define('cv-embed', CvEmbed);
  }
});

async function mount(file: CvFile, language = ''): Promise<CvEmbed> {
  const el = document.createElement('cv-embed') as CvEmbed;
  if (language) el.setAttribute('language', language);
  document.body.appendChild(el);
  await el.updateComplete;
  // Inject the extracted file through the private reactive state, then flush.
  (el as unknown as { file: CvFile; loading: boolean }).file = file;
  (el as unknown as { loading: boolean }).loading = false;
  await el.updateComplete;
  return el;
}

describe('clean text light-DOM projection', () => {
  it('places the extracted clean text in the LIGHT DOM, not only the shadow root', async () => {
    const file = makeFile('en', [payload('text/markdown', 'en', '# Jane Doe\n\nSenior engineer.')]);
    const el = await mount(file);

    const lightNode = el.querySelector('[data-cv-clean-text]');
    expect(lightNode).not.toBeNull();
    expect(lightNode?.textContent).toContain('Senior engineer');
    expect(el.cleanText).toContain('Senior engineer');

    // The light-DOM node is a direct child of the host (crawler-visible),
    // not inside the shadow root.
    expect(lightNode?.getRootNode()).toBe(document);
  });

  it('re-selects the clean text when language changes', async () => {
    const file = makeFile('en', [
      payload('text/markdown', 'en', '# English résumé'),
      payload('text/markdown', 'fr', '# CV français'),
    ]);
    const el = await mount(file);
    expect(el.cleanText).toContain('English');

    el.setAttribute('language', 'fr');
    await el.updateComplete;
    expect(el.cleanText).toContain('français');
    expect(el.querySelector('[data-cv-clean-text]')?.textContent).toContain('français');
  });
});
