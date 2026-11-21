// Draws a turn's tool results as cvfile.org's cards under the answer: the validation report, the draft, the
// install cards and the sources.

import type { ChatTurn } from '@tensorpass/aiconnect-react';
import type { PackageInfo } from '../../../../../server/mcp/siteData.ts';
import type { FileReport } from '../../files/cvReport.ts';
import { DocLinks } from './DocLinks.tsx';
import { DraftCard } from './DraftCard.tsx';
import type { DraftResult } from './DraftCard.tsx';
import { PackageCards } from './PackageCards.tsx';
import { resultsOf } from './toolResults.ts';
import { ValidationCard } from './ValidationCard.tsx';

export function renderCards(turn: ChatTurn) {
  const reports = resultsOf<FileReport>(turn, 'validate_cv');
  const drafts = resultsOf<DraftResult>(turn, 'fill_markdown_draft');
  const packages = resultsOf<PackageInfo[]>(turn, 'list_packages').flat();
  const hits = resultsOf<Array<{ title: string; heading: string; url: string }>>(turn, 'search_docs').flat();
  if (!reports.length && !drafts.length && !packages.length && !hits.length) {
    return null;
  }
  return (
    <div className="ai-results">
      {reports.map((report, index) => <ValidationCard key={`report-${index}`} report={report} />)}
      {drafts.map((draft, index) => <DraftCard key={`draft-${index}`} draft={draft} />)}
      {packages.length ? <PackageCards packages={packages} /> : null}
      {hits.length ? <DocLinks hits={hits} /> : null}
    </div>
  );
}
