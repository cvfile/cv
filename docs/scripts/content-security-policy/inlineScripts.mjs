// The inline scripts of the built pages, as the hashes a Content-Security-Policy allows them by. Astro writes
// three into every page: the theme script of Page.astro and the runtime of its React islands. A script with
// a src is covered by 'self', and a JSON-LD block is data the browser never runs, so neither is hashed.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'parse5';

/** @typedef {import('parse5').DefaultTreeAdapterMap['node']} Node */
/** @typedef {import('parse5').DefaultTreeAdapterMap['element']} Element */

// The types a browser runs as script (https://html.spec.whatwg.org/#prepare-the-script-element).
const RUNNABLE_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);

/** @param {Element} element @param {string} name */
const attribute = (element, name) => element.attrs.find((attr) => attr.name === name)?.value;

/** @param {Element} element */
function isInlineRunnable(element) {
  const type = (attribute(element, 'type') ?? '').trim().toLowerCase();
  return attribute(element, 'src') === undefined && RUNNABLE_TYPES.has(type);
}

/** @param {Node} node @param {string[]} found @returns {string[]} */
function collectInline(node, found) {
  if ('tagName' in node && node.tagName === 'script' && isInlineRunnable(node)) {
    found.push(node.childNodes.map((child) => ('value' in child ? child.value : '')).join(''));
  }
  const children = 'content' in node ? node.content.childNodes : 'childNodes' in node ? node.childNodes : [];
  for (const child of children) {
    collectInline(child, found);
  }
  return found;
}

/** The CSP source of a script's text: its SHA-256 in base64, as the browser hashes it. */
export const scriptHash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** The hashes of the inline scripts of one HTML document. */
export const inlineScriptHashes = (html) => collectInline(parse(html), []).map(scriptHash);

/** @param {string} dir @returns {string[]} */
function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return htmlFiles(file);
    }
    return entry.name.endsWith('.html') ? [file] : [];
  });
}

/** The hashes of every inline script of the built site, sorted and without repeats. */
export function siteScriptHashes(distDir) {
  const hashes = htmlFiles(distDir).flatMap((file) => inlineScriptHashes(readFileSync(file, 'utf8')));
  return [...new Set(hashes)].sort();
}
