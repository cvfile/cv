import { extract } from '@cvfile/sdk';
import type { CvFile, ExtractedPayload } from '@cvfile/sdk';
import { negotiate, type ServeFormat } from './conneg.js';

export interface ServeRequest {
  bytes: Uint8Array;
  accept?: string | undefined;
  acceptLanguage?: string | undefined;
  formatQuery?: string | undefined;
  defaultFormat?: ServeFormat | undefined;
}

export interface ServeResponse {
  format: ServeFormat;
  contentType: string;
  language?: string | undefined;
  body: Uint8Array;
}

const ENCODER = new TextEncoder();

export async function serveCv(req: ServeRequest): Promise<ServeResponse> {
  const decision = negotiate({
    accept: req.accept,
    acceptLanguage: req.acceptLanguage,
    formatQuery: req.formatQuery,
    defaultFormat: req.defaultFormat,
  });

  if (decision.format === 'pdf') {
    return {
      format: 'pdf',
      contentType: 'application/vnd.cv+pdf',
      ...(decision.language !== undefined ? { language: decision.language } : {}),
      body: req.bytes,
    };
  }

  const file = await extract(req.bytes);
  const preferLang = decision.language ?? file.metadata.primaryLanguage;

  if (decision.format === 'markdown') {
    const md = pickPayload(file, 'text/markdown', preferLang);
    if (md) {
      return {
        format: 'markdown',
        contentType: 'text/markdown; charset=utf-8',
        ...(md.language !== undefined ? { language: md.language } : {}),
        body: md.bytes,
      };
    }
    return fallbackToPdf(req.bytes);
  }

  if (decision.format === 'html') {
    const html = pickPayload(file, 'text/html', preferLang);
    if (html) {
      return {
        format: 'html',
        contentType: 'text/html; charset=utf-8',
        ...(html.language !== undefined ? { language: html.language } : {}),
        body: html.bytes,
      };
    }
    const md = pickPayload(file, 'text/markdown', preferLang);
    if (md) {
      const body = ENCODER.encode(renderMarkdownAsHtml(md.text(), file));
      return {
        format: 'html',
        contentType: 'text/html; charset=utf-8',
        ...(md.language !== undefined ? { language: md.language } : {}),
        body,
      };
    }
    return fallbackToPdf(req.bytes);
  }

  return fallbackToPdf(req.bytes);
}

function pickPayload(file: CvFile, mimeType: string, preferLang: string): ExtractedPayload | undefined {
  const matches = file.payloads.filter((p) => p.mimeType === mimeType);
  if (matches.length === 0) return undefined;
  return matches.find((p) => p.language === preferLang) ?? matches[0];
}

function fallbackToPdf(bytes: Uint8Array): ServeResponse {
  return { format: 'pdf', contentType: 'application/vnd.cv+pdf', body: bytes };
}

function renderMarkdownAsHtml(md: string, file: CvFile): string {
  const safe = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="${file.metadata.primaryLanguage}">
<head>
<meta charset="utf-8">
<title>${file.metadata.primaryPayload}</title>
</head>
<body>
<pre>${safe}</pre>
</body>
</html>`;
}
