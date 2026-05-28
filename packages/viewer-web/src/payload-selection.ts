import type { CvFile, ExtractedPayload } from '@cvfile/sdk';

/**
 * Select the payload of a given mime type, preferring `language`, then the
 * file's `primaryLanguage`, then the first match. Mirrors the SDK's
 * `pickByLanguage` semantics used internally by `extractMarkdown`/`extractHtml`.
 */
export function pickPayloadByLanguage(
  file: CvFile,
  mimeType: string,
  language: string,
): ExtractedPayload | undefined {
  const matches = file.payloads.filter((p) => p.mimeType === mimeType);
  if (matches.length === 0) return undefined;
  const preferred = language || file.metadata.primaryLanguage;
  return matches.find((p) => p.language === preferred) ?? matches[0];
}

/**
 * The crawler-friendly clean text for a file: the selected markdown payload, or
 * HTML as a fallback, or an empty string when neither exists.
 */
export function selectCleanText(file: CvFile, language: string): string {
  return (
    pickPayloadByLanguage(file, 'text/markdown', language)?.text() ??
    pickPayloadByLanguage(file, 'text/html', language)?.text() ??
    ''
  );
}
