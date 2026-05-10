export type ServeFormat = 'pdf' | 'markdown' | 'html';

export interface NegotiationInput {
  accept?: string | undefined;
  acceptLanguage?: string | undefined;
  formatQuery?: string | undefined;
}

export interface NegotiationResult {
  format: ServeFormat;
  language: string | undefined;
}

const FORMAT_BY_MIME: Record<string, ServeFormat> = {
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'application/pdf': 'pdf',
  'application/vnd.cv+pdf': 'pdf',
};

const FORMAT_BY_QUERY: Record<string, ServeFormat> = {
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  pdf: 'pdf',
  cv: 'pdf',
};

interface ParsedAccept {
  type: string;
  q: number;
}

export function parseAccept(header: string | undefined | null): ParsedAccept[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [type, ...params] = part.trim().split(';').map((s) => s.trim());
      let q = 1;
      for (const p of params) {
        const m = p.match(/^q\s*=\s*(\d*\.?\d+)/i);
        if (m) q = Number(m[1]);
      }
      return { type: (type ?? '').toLowerCase(), q };
    })
    .filter((p) => p.type)
    .sort((a, b) => b.q - a.q);
}

export function parseAcceptLanguage(header: string | undefined | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';').map((s) => s.trim());
      let q = 1;
      for (const p of params) {
        const m = p.match(/^q\s*=\s*(\d*\.?\d+)/i);
        if (m) q = Number(m[1]);
      }
      return { tag: (tag ?? '').toLowerCase(), q };
    })
    .filter((p) => p.tag && p.tag !== '*')
    .sort((a, b) => b.q - a.q)
    .map((p) => p.tag);
}

export function negotiate(input: NegotiationInput): NegotiationResult {
  const language = parseAcceptLanguage(input.acceptLanguage)[0];

  if (input.formatQuery) {
    const fromQuery = FORMAT_BY_QUERY[input.formatQuery.toLowerCase()];
    if (fromQuery) {
      return { format: fromQuery, language };
    }
  }

  const accepts = parseAccept(input.accept);
  for (const a of accepts) {
    const direct = FORMAT_BY_MIME[a.type];
    if (direct) {
      return { format: direct, language };
    }
    if (a.type === '*/*' || a.type === 'application/*') {
      return { format: 'pdf', language };
    }
    if (a.type === 'text/*') {
      return { format: 'html', language };
    }
  }

  return { format: 'pdf', language };
}

export interface BuildLinkHeaderInput {
  selfUrl: string;
  cvMime?: string;
}

export function buildLinkHeader({ selfUrl, cvMime = 'application/vnd.cv+pdf' }: BuildLinkHeaderInput): string {
  const sep = selfUrl.includes('?') ? '&' : '?';
  return [
    `<${selfUrl}>; rel="alternate"; type="${cvMime}"`,
    `<${selfUrl}${sep}format=md>; rel="alternate"; type="text/markdown"`,
    `<${selfUrl}${sep}format=html>; rel="alternate"; type="text/html"`,
  ].join(', ');
}

export const PDF_PRIMARY_MIME = 'application/vnd.cv+pdf';
export const PDF_FALLBACK_MIME = 'application/pdf';
