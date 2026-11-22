// The text of a built page as the chat may cite it: its main content as plain text with Markdown headings,
// so the index cuts passages under the right heading. The page is parsed with parse5, the HTML parser of the
// specification, so text comes from the parsed tree and its entities are decoded by the parser.

import { parse } from 'parse5';

/** @typedef {import('parse5').DefaultTreeAdapterMap['node']} Node */
/** @typedef {import('parse5').DefaultTreeAdapterMap['element']} Element */

// Elements whose content is page chrome or code, never prose.
const CHROME = new Set(['script', 'style', 'noscript', 'template', 'svg', 'nav', 'aside', 'form', 'button']);
// The site's frame around the content, left out when a page has no <main> or <article>.
const SITE_FRAME = new Set(['header', 'footer']);
const BLOCKS = new Set(['p', 'div', 'section', 'li', 'tr', 'br', 'dd', 'dt', 'blockquote', 'pre', 'table']);
const HEADING = /^h([1-6])$/;

/** @param {Node} node @returns {node is Element} */
const isElement = (node) => 'tagName' in node;

/** @param {Node} node @param {(element: Element) => boolean} test @returns {Element | null} */
function findElement(node, test) {
  if (isElement(node) && test(node)) {
    return node;
  }
  for (const child of 'childNodes' in node ? node.childNodes : []) {
    const found = findElement(child, test);
    if (found) {
      return found;
    }
  }
  return null;
}

/** @param {Node} node @param {Set<string>} skipped @returns {string} */
function textOf(node, skipped) {
  if (node.nodeName === '#text') {
    return /** @type {{ value: string }} */ (node).value;
  }
  if (!isElement(node) && node.nodeName !== '#document') {
    return '';
  }
  const tag = isElement(node) ? node.tagName : '';
  if (skipped.has(tag)) {
    return ' ';
  }
  const inner = ('childNodes' in node ? node.childNodes : []).map((child) => textOf(child, skipped)).join('');
  const heading = HEADING.exec(tag);
  if (heading) {
    return `\n\n${'#'.repeat(Number(heading[1]))} ${inner.replace(/\s+/g, ' ').trim()}\n\n`;
  }
  return BLOCKS.has(tag) ? `\n\n${inner}` : inner;
}

/** @param {string} text @returns {string} */
function tidy(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Plain text with Markdown headings: the page's <main> or <article>, or else its body without the site's
// header and footer.
/** @param {Node} document @returns {string} */
function mainText(document) {
  const main = findElement(document, (element) => element.tagName === 'main')
    ?? findElement(document, (element) => element.tagName === 'article');
  if (main) {
    return tidy(textOf(main, CHROME));
  }
  const body = findElement(document, (element) => element.tagName === 'body') ?? document;
  return tidy(textOf(body, new Set([...CHROME, ...SITE_FRAME])));
}

/** @param {Node} document @returns {string} */
function titleOf(document) {
  const title = findElement(document, (element) => element.tagName === 'h1')
    ?? findElement(document, (element) => element.tagName === 'title');
  return title ? textOf(title, CHROME).replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim() : '';
}

/** @param {Node} document @returns {boolean} */
function isNoindex(document) {
  const robots = findElement(document, (element) => element.tagName === 'meta'
    && element.attrs.some((attr) => attr.name === 'name' && attr.value === 'robots'));
  return Boolean(robots?.attrs.some((attr) => attr.name === 'content' && /noindex/i.test(attr.value)));
}

// What the index reads of a built page: its title, its main text, and whether it asks search engines to
// leave it out.
/** @param {string} html @returns {{ title: string, text: string, noindex: boolean }} */
export function pageContent(html) {
  const document = parse(html);
  return { title: titleOf(document), text: mainText(document), noindex: isNoindex(document) };
}
