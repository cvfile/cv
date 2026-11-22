// The HTML copy the builder packs beside the Markdown: the Markdown rendered with marked, every raw HTML block
// of it escaped (spec §7.3: never bake unsanitised HTML into resume.html), in a page of its own. A link keeps
// its address only for a web, mail or phone scheme or a relative address: the Markdown may be an AI draft of
// an uploaded PDF, and a javascript: or data: link planted in that PDF becomes plain text.

import type { Marked, RendererObject } from 'marked';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!);
}

export function firstHeading(markdown: string): string {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? 'Resume';
}

const PAGE_STYLE = `:root { color-scheme: light dark; line-height: 1.65;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
body { max-width: 720px; margin: 2.5rem auto; padding: 0 1.5rem; color: #111; background: #fff; }
@media (prefers-color-scheme: dark) { body { color: #f3f4f6; background: #0b0b0d; } }
h1 { font-size: 2.2rem; margin: 0 0 0.5rem; }
h2 { margin-top: 2rem; padding-bottom: 0.25rem; border-bottom: 1px solid currentColor; }
h3 { margin-top: 1.25rem; }
em { color: inherit; opacity: 0.75; }
ul { padding-left: 1.25rem; }`;

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

// Browsers drop ASCII whitespace and control characters from a URL before reading its scheme.
const withoutUrlNoise = (href: string) => [...href].filter((character) => character > ' ').join('');

export function isSafeHref(href: string): boolean {
  const scheme = SCHEME.exec(withoutUrlNoise(href))?.[1]?.toLowerCase();
  return scheme === undefined || SAFE_SCHEMES.has(scheme);
}

const renderer: RendererObject = {
  html: (token) => escapeHtml(token.text),
  // false hands a safe link to marked's own renderer; an unsafe one keeps its text only.
  link(token) {
    return isSafeHref(token.href) ? false : this.parser.parseInline(token.tokens);
  },
};

let markdownParser: Promise<Marked> | undefined;

// marked loads on the first build only, so its bundle stays out of the page's first chunk.
function loadParser(): Promise<Marked> {
  markdownParser ??= import('marked').then(({ Marked }) => new Marked({ async: false, renderer }));
  return markdownParser;
}

export async function renderHtml(markdown: string, title: string, lang: string): Promise<string> {
  const body = (await loadParser()).parse(markdown) as string;
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${PAGE_STYLE}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
