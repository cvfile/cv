// The documents the docs index holds, read when the site is built: the built pages of cvfile.org, each
// section of the specification, and the repository's READMEs and changelog. Each document has the `path`
// read_doc_page takes and the `url` a visitor opens.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { sectionAnchor } from '../../src/lib/specAnchors.mjs';
import { pageContent } from './htmlText.mjs';

/** @typedef {import('../../server/search/siteIndex.mjs').Page} Page */

const SITE = 'https://cvfile.org';
const BLOB = 'https://github.com/cvfile/cv/blob/main/';
const SPEC_FILE = 'spec/cv-1.0.md';
// The spec page is indexed from its Markdown, section by section.
const PAGES_FROM_SOURCE = new Set(['/spec/']);
const README_FOLDERS = ['packages', 'integrations', 'sdks'];
const TOP_LEVEL_FILES = ['README.md', 'CHANGELOG.md', 'SECURITY.md'];

// HTML comments removed until none is left, so a comment written inside another one leaves no opening
// behind.
/** @param {string} markdown @returns {string} */
function withoutComments(markdown) {
  let previous;
  let text = markdown;
  do {
    previous = text;
    text = text.replace(/<!--[\s\S]*?-->/g, '');
  } while (text !== previous);
  return text;
}

// Markdown as the index cuts it: images and HTML comments dropped, and the blank lines inside code fences
// removed, so a fence stays one block and a shell comment in it is never read as a heading.
/** @param {string} markdown @returns {string} */
export function indexableMarkdown(markdown) {
  return withoutComments(markdown)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^```[\s\S]*?^```/gm, (fence) => fence.replace(/\n\s*\n/g, '\n'));
}

/** @param {string} dir @returns {string[]} */
function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return htmlFiles(full);
    }
    return entry.name === 'index.html' ? [full] : [];
  });
}

/** @param {string} distDir @returns {Page[]} */
export function sitePages(distDir) {
  return htmlFiles(distDir).flatMap((file) => {
    const relative = path.relative(distDir, path.dirname(file)).split(path.sep).join('/');
    const pagePath = relative ? `/${relative}/` : '/';
    if (PAGES_FROM_SOURCE.has(pagePath)) {
      return [];
    }
    const { title, text, noindex } = pageContent(readFileSync(file, 'utf8'));
    return noindex ? [] : [{ path: pagePath, url: `${SITE}${pagePath}`, title: title || pagePath, text }];
  });
}

// One document per top level section of the specification, linked to the section's anchor on /spec/.
/** @param {string} rootDir @returns {Page[]} */
export function specSections(rootDir) {
  const source = indexableMarkdown(readFileSync(path.join(rootDir, SPEC_FILE), 'utf8'));
  return source.split(/^(?=## )/m).slice(1).map((section) => {
    const [headingLine, ...body] = section.split('\n');
    const heading = headingLine.replace(/^##\s+/, '').trim();
    const anchor = sectionAnchor(heading);
    const pagePath = anchor ? `/spec/#${anchor}` : '/spec/';
    return { path: pagePath, url: `${SITE}${pagePath}`, title: `Specification ${heading}`, text: body.join('\n') };
  });
}

/** @param {string} rootDir @returns {string[]} */
function readmePaths(rootDir) {
  const nested = README_FOLDERS.flatMap((folder) => readdirSync(path.join(rootDir, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${folder}/${entry.name}/README.md`));
  return [...TOP_LEVEL_FILES, 'integrations/README.md', 'tools/cv-detector/README.md', ...nested]
    .filter((file) => existsSync(path.join(rootDir, file)));
}

/** @param {string} rootDir @returns {Page[]} */
export function repositoryFiles(rootDir) {
  return readmePaths(rootDir).map((file) => {
    const source = indexableMarkdown(readFileSync(path.join(rootDir, file), 'utf8'));
    const title = /^#\s+(.+)$/m.exec(source)?.[1]?.trim() ?? file;
    return { path: file, url: `${BLOB}${file}`, title, text: source };
  });
}
