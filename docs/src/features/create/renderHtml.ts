// The HTML copy the builder packs beside the Markdown: the Markdown rendered with marked, every raw HTML block
// of it escaped (spec §7.3: never bake unsanitised HTML into resume.html), in a page of its own.

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!);
}

export function firstHeading(markdown: string): string {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? 'Resume';
}

const PAGE_STYLE = `:root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.65; }
body { max-width: 720px; margin: 2.5rem auto; padding: 0 1.5rem; color: #111; background: #fff; }
@media (prefers-color-scheme: dark) { body { color: #f3f4f6; background: #0b0b0d; } }
h1 { font-size: 2.2rem; margin: 0 0 0.5rem; }
h2 { margin-top: 2rem; padding-bottom: 0.25rem; border-bottom: 1px solid currentColor; }
h3 { margin-top: 1.25rem; }
em { color: inherit; opacity: 0.75; }
ul { padding-left: 1.25rem; }`;

export async function renderHtml(markdown: string, title: string, lang: string): Promise<string> {
  // marked loads on the first build only, so its bundle stays out of the page's first chunk.
  const { marked } = await import('marked');
  marked.use({
    renderer: {
      html(token: string | { text: string }): string {
        return escapeHtml(typeof token === 'string' ? token : token.text);
      },
    },
  });
  const body = marked.parse(markdown, { async: false }) as string;
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
