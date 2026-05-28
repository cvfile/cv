import { describe, expect, it } from 'vitest';
import type { CvFile, ExtractedPayload } from '@cvfile/sdk';
import { pickPayloadByLanguage, selectCleanText } from '../src/payload-selection.js';

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

function file(primaryLanguage: string, payloads: ExtractedPayload[]): CvFile {
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

describe('pickPayloadByLanguage', () => {
  const f = file('en', [
    payload('text/markdown', 'en', 'English résumé'),
    payload('text/markdown', 'fr', 'CV français'),
  ]);

  it('prefers the requested language', () => {
    expect(pickPayloadByLanguage(f, 'text/markdown', 'fr')?.text()).toBe('CV français');
  });

  it('falls back to primaryLanguage when no requested language', () => {
    expect(pickPayloadByLanguage(f, 'text/markdown', '')?.text()).toBe('English résumé');
  });

  it('falls back to the first match when neither language is present', () => {
    expect(pickPayloadByLanguage(f, 'text/markdown', 'de')?.text()).toBe('English résumé');
  });

  it('returns undefined when no payload of the mime type exists', () => {
    expect(pickPayloadByLanguage(f, 'text/html', 'en')).toBeUndefined();
  });
});

describe('selectCleanText', () => {
  it('prefers markdown over html', () => {
    const f = file('en', [
      payload('text/html', 'en', '<p>html</p>'),
      payload('text/markdown', 'en', '# md'),
    ]);
    expect(selectCleanText(f, 'en')).toBe('# md');
  });

  it('falls back to html when there is no markdown', () => {
    const f = file('en', [payload('text/html', 'en', '<p>html</p>')]);
    expect(selectCleanText(f, 'en')).toBe('<p>html</p>');
  });

  it('selects clean text by requested language', () => {
    const f = file('en', [
      payload('text/markdown', 'en', 'English'),
      payload('text/markdown', 'fr', 'Français'),
    ]);
    expect(selectCleanText(f, 'fr')).toBe('Français');
  });

  it('returns empty string when there is no text payload', () => {
    const f = file('en', [payload('application/pdf', 'en', 'binary')]);
    expect(selectCleanText(f, 'en')).toBe('');
  });
});
