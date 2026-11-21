// The specification as the /spec/ page shows it, rendered once at build time from spec/cv-1.0.md, a trusted
// file of this repository. Every heading is demoted one level, so the page keeps a single h1 (its header)
// and the spec body starts at h2, and each numbered heading gets the anchor the docs index links to, such
// as #s4-1 for "4.1 Filespec dictionary requirements".

import { Marked } from 'marked';
import type { Tokens } from 'marked';
import { sectionAnchor } from './specAnchors.mjs';

const specMarked = new Marked({
  renderer: {
    heading({ tokens, depth, text }: Tokens.Heading) {
      const anchor = sectionAnchor(text);
      const id = anchor ? ` id="${anchor}"` : '';
      return `<h${depth}${id}>${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});

export function specHtml(source: string): string {
  const demoted = source.replace(/^(#{1,5})\s/gm, '#$1 ');
  return specMarked.parse(demoted, { async: false }) as string;
}
