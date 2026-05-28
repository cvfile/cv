export type ServeFormat = 'pdf' | 'markdown' | 'html';

export interface NegotiationInput {
  accept?: string | undefined;
  acceptLanguage?: string | undefined;
  formatQuery?: string | undefined;
  defaultFormat?: ServeFormat | undefined;
}

export interface NegotiationResult {
  format: ServeFormat;
  language: string | undefined;
}

const MARKDOWN_MIMES = new Set(['text/markdown', 'text/x-markdown', 'application/vnd.cv+markdown']);
const PDF_MIMES = new Set(['application/pdf', 'application/vnd.cv+pdf']);
const HTML_MIMES = new Set(['text/html', 'application/xhtml+xml']);

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
    .map((part): ParsedAccept | null => {
      const [type, ...params] = part.trim().split(';').map((s) => s.trim());
      const q = parseQ(params);
      // A malformed q (present but unparseable) marks the type as unusable per RFC 9110.
      if (q === null) return null;
      return { type: (type ?? '').toLowerCase(), q };
    })
    .filter((p): p is ParsedAccept => p !== null && p.type !== '' && p.q > 0)
    .sort((a, b) => b.q - a.q);
}

/**
 * Resolve the q-value of a media-range's parameters.
 * Returns 1 when absent, the clamped [0,1] value when valid, and null when a
 * q parameter is present but cannot be parsed (signalling a malformed type).
 */
function parseQ(params: string[]): number | null {
  for (const p of params) {
    if (!/^q\s*=/i.test(p)) continue;
    const m = p.match(/^q\s*=\s*(\d*\.?\d+)\s*$/i);
    if (!m) return null;
    const value = Number(m[1]);
    if (Number.isNaN(value)) return null;
    return Math.min(1, Math.max(0, value));
  }
  return 1;
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

  // An explicit ?format= query is the only override and wins over Accept.
  if (input.formatQuery) {
    const fromQuery = FORMAT_BY_QUERY[input.formatQuery.toLowerCase()];
    if (fromQuery) {
      return { format: fromQuery, language };
    }
  }

  const fromAccept = negotiateFromAccept(input.accept);
  const format = fromAccept ?? input.defaultFormat ?? 'pdf';
  return { format, language };
}

/**
 * Map an Accept header to a format following the .cv contract:
 *  - markdown only when it is an explicit, top, non-wildcard preference;
 *  - html only when text/html is requested without a wildcard (a deliberate fetch);
 *  - pdf for the browser case (text/html alongside a wildcard, or any wildcard);
 *  - undefined when the header expresses no usable preference (caller falls back).
 */
function negotiateFromAccept(header: string | undefined): ServeFormat | undefined {
  const accepts = parseAccept(header);
  if (accepts.length === 0) return undefined;

  const topQ = accepts[0]!.q;
  const top = accepts.filter((a) => a.q === topQ);
  const hasWildcard = accepts.some((a) => a.type === '*/*' || a.type === 'application/*');

  // Markdown wins only as an explicit, top, non-wildcard preference.
  if (top.some((a) => MARKDOWN_MIMES.has(a.type))) {
    return 'markdown';
  }

  // An explicit, top preference for the PDF type also serves PDF.
  if (top.some((a) => PDF_MIMES.has(a.type))) {
    return 'pdf';
  }

  // A deliberate HTML fetch: text/html requested without a catch-all wildcard.
  if (top.some((a) => HTML_MIMES.has(a.type)) && !hasWildcard) {
    return 'html';
  }

  // Browser case (text/html + */*) or any wildcard: serve the visual PDF.
  if (hasWildcard || top.some((a) => HTML_MIMES.has(a.type))) {
    return 'pdf';
  }

  // text/* (without a more specific match) is a deliberate text fetch -> html.
  if (top.some((a) => a.type === 'text/*')) {
    return 'html';
  }

  return undefined;
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
