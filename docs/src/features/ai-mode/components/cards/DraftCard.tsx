// The draft the assistant wrote into the builder: its sections, its length and language, the lines the PDF
// does not show, and a link to the editor where the visitor reviews it before Build.

import { MARKDOWN_FIELD_ID } from '../../../create/draftEditor.ts';

export interface DraftResult {
  written: boolean;
  language: string;
  lines: number;
  headings: string[];
  linesNotInPdf: string[];
}

export function DraftCard({ draft }: { draft: DraftResult }) {
  return (
    <section className="ai-card" aria-label="Markdown draft">
      <p className="ai-card__head">
        <span className="ai-mark ai-mark--verified">Draft written</span>
        <span className="ai-card__meta">{draft.lines} lines · {draft.headings.length} headings · {draft.language}</span>
      </p>
      <p className="ai-card__text">{draft.headings.map((heading) => heading.replace(/^#+\s*/, '')).join(' · ')}</p>
      {draft.linesNotInPdf.length ? (
        <div className="ai-card__warn">
          <p className="ai-card__text">Check these lines, the PDF does not show them:</p>
          <ul className="ai-card__list">{draft.linesNotInPdf.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      ) : null}
      <a className="ai-card__action" href={`#${MARKDOWN_FIELD_ID}`}>Review in the editor</a>
    </section>
  );
}
