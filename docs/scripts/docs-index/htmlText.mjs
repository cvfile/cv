// The text of a built page as the chat may cite it: its main content as plain text with Markdown headings,
// so the index cuts passages under the right heading.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code.startsWith('#')) {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const CHROME = /<(script|style|noscript|template|svg|nav|aside|form|button)\b[\s\S]*?<\/\1>/gi;
const SITE_FRAME = /<(header|footer)\b[\s\S]*?<\/\1>/gi;

// The page's main content: its <main> or <article>, or else its body without the site's header and footer.
function mainHtml(html) {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html) ?? /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (main) {
    return main[1];
  }
  return (/<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html).replace(SITE_FRAME, ' ');
}

// Plain text with Markdown headings, so the index cuts passages under the right heading.
export function htmlToText(html) {
  const body = mainHtml(html)
    .replace(CHROME, ' ')
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (whole, level, inner) => (
      `\n\n${'#'.repeat(Number(level))} ${inner.replace(/<[^>]+>/g, '').trim()}\n\n`))
    .replace(/<(?:p|div|section|li|tr|br|dd|dt|blockquote|pre|table)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(body)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function pageTitle(html) {
  const title = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  return decodeEntities(title.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

export function isNoindex(html) {
  const meta = /<meta\b[^>]*name=["']robots["'][^>]*>/i.exec(html)?.[0] ?? '';
  return /noindex/i.test(meta);
}
