// The docs search index: cvfile.org's pages, the specification and the repository's READMEs cut into
// passages under their headings, and a BM25 ranking over them. Pure functions with no dependency. The
// index is plain JSON, built with the site (scripts/build-docs-index.mjs) and read by the MCP server, so a
// search costs the site no model and no service.
//
// A document's `path` is the key read_doc_page takes: a page path such as /install/, a spec section such as
// /spec/#s4, or a repository file such as packages/sdk-js/README.md. Its `url` is the address a visitor
// opens.

/**
 * @typedef {{ path: string, url: string, title: string, text: string }} Page
 * @typedef {{ path: string, url: string, title: string, heading: string, text: string }} Passage
 * @typedef {Passage & { length: number, terms: Record<string, number> }} IndexedPassage
 * @typedef {{ builtAt: string, pages: number, averageLength: number,
 *   documentFrequency: Record<string, number>, passages: IndexedPassage[] }} SiteIndex
 */

const PASSAGE_CHARS = 1200;
const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 2;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'of', 'on',
  'or', 'the', 'to', 'what', 'with', 'you', 'your', 'au', 'aux', 'ce', 'de', 'des', 'du', 'en', 'est', 'et', 'il',
  'la', 'le', 'les', 'un', 'une', 'pour', 'que', 'qui', 'sur', 'dans', 'par', 'pas', 'vous', 'nous', 'je',
  'את', 'של', 'על', 'עם', 'זה', 'מה', 'איך', 'יש', 'לא', 'גם', 'או',
]);
const HEBREW_PREFIXES = /^[והבלמשכ](?=[֐-׿]{3,})/u;

// Words as the index stores them: lower case, accents removed, a final plural "s" dropped, and in Hebrew
// the word with and without its one letter prefix (ה, ו, ב, ל, מ, ש, כ).
/** @param {string} text @returns {string[]} */
export function tokenize(text) {
  const plain = String(text).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const words = plain.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.flatMap((word) => {
    if (STOP_WORDS.has(word) || word.length < 2) {
      return [];
    }
    if (HEBREW_PREFIXES.test(word)) {
      return [word, word.replace(HEBREW_PREFIXES, '')];
    }
    return [word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word];
  });
}

// One page in passages: each passage keeps the heading it sits under, and long sections are cut at
// paragraph ends near PASSAGE_CHARS.
/** @param {Page} page @returns {Passage[]} */
export function passagesOf(page) {
  const passages = [];
  let heading = page.title;
  let buffer = '';
  const flush = () => {
    if (buffer.trim()) {
      passages.push({ path: page.path, url: page.url, title: page.title, heading, text: buffer.trim() });
    }
    buffer = '';
  };
  for (const block of page.text.split(/\n{2,}/)) {
    const headingMatch = /^#{1,6}\s+(.+)$/.exec(block.trim());
    if (headingMatch) {
      flush();
      heading = headingMatch[1].trim();
      continue;
    }
    if (buffer.length + block.length > PASSAGE_CHARS) {
      flush();
    }
    buffer += `${block.trim()}\n\n`;
  }
  flush();
  return passages;
}

function countTerms(tokens) {
  const counts = {};
  for (const token of tokens) {
    counts[token] = (counts[token] ?? 0) + 1;
  }
  return counts;
}

// The index of every page: its passages with their term counts, and how many passages hold each term.
/** @param {Page[]} pages @param {string} [builtAt] @returns {SiteIndex} */
export function buildIndex(pages, builtAt = new Date().toISOString()) {
  const passages = pages.flatMap(passagesOf).map((passage) => {
    const titleTokens = tokenize(`${passage.title} ${passage.heading}`);
    const tokens = [...tokenize(passage.text), ...Array(TITLE_WEIGHT).fill(titleTokens).flat()];
    return { ...passage, length: tokens.length, terms: countTerms(tokens) };
  });
  const documentFrequency = {};
  for (const passage of passages) {
    for (const term of Object.keys(passage.terms)) {
      documentFrequency[term] = (documentFrequency[term] ?? 0) + 1;
    }
  }
  const averageLength = passages.reduce((sum, passage) => sum + passage.length, 0) / (passages.length || 1);
  return { builtAt, pages: pages.length, averageLength, documentFrequency, passages };
}

function score(index, passage, terms) {
  return terms.reduce((sum, term) => {
    const frequency = passage.terms[term];
    if (!frequency) {
      return sum;
    }
    const holders = index.documentFrequency[term];
    const idf = Math.log(1 + (index.passages.length - holders + 0.5) / (holders + 0.5));
    const norm = frequency + K1 * (1 - B + B * (passage.length / index.averageLength));
    return sum + idf * ((frequency * (K1 + 1)) / norm);
  }, 0);
}

// The best passages for a query, each with its document's path and address.
/** @param {SiteIndex} index @param {string} query @param {number} [limit] @returns {Passage[]} */
export function searchIndex(index, query, limit = 5) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) {
    return [];
  }
  return index.passages
    .map((passage) => ({ passage, score: score(index, passage, terms) }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ passage }) => ({
      title: passage.title, heading: passage.heading, path: passage.path, url: passage.url, text: passage.text,
    }));
}

// A whole document of the index, by its path, for a follow up question about one page.
/** @param {SiteIndex} index @param {string} path @returns {Page | null} */
export function pageText(index, path) {
  const passages = index.passages.filter((passage) => passage.path === path);
  if (!passages.length) {
    return null;
  }
  const [{ title, url }] = passages;
  let heading = title;
  const parts = passages.map((passage) => {
    const opening = passage.heading === heading ? '' : `## ${passage.heading}\n\n`;
    heading = passage.heading;
    return `${opening}${passage.text}`;
  });
  return { path, url, title, text: parts.join('\n\n') };
}
