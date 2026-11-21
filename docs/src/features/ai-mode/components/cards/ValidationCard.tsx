// The validation report of the dropped .cv file, as cvfile.org draws it: the verdict, each issue with its
// spec section, the payloads with their integrity check, and how the Markdown copy compares with the PDF.

import type { FileReport } from '../../files/cvReport.ts';

function Issues({ issues }: { issues: FileReport['issues'] }) {
  if (!issues.length) {
    return null;
  }
  return (
    <ul className="ai-card__list">
      {issues.map((issue) => (
        <li key={`${issue.code} ${issue.payload ?? ''}`}>
          <code>{issue.code}</code> {issue.message}
          {issue.specUrl ? <> <a href={issue.specUrl}>spec</a></> : null}
        </li>
      ))}
    </ul>
  );
}

function Payloads({ payloads }: { payloads: NonNullable<FileReport['payloads']> }) {
  return (
    <ul className="ai-card__list">
      {payloads.map((payload) => (
        <li key={payload.name}>
          <code>{payload.name}</code> {payload.language ?? ''} · {(payload.bytes / 1024).toFixed(1)} KB · integrity{' '}
          <span className={`ai-mark ai-mark--${payload.integrity.replace(' ', '-')}`}>{payload.integrity}</span>
        </li>
      ))}
    </ul>
  );
}

function Comparison({ comparison }: { comparison: NonNullable<FileReport['markdownVsPdf']> }) {
  if (comparison.consistent) {
    return <p className="ai-card__text">The Markdown copy says what the PDF shows.</p>;
  }
  return (
    <div className="ai-card__warn">
      <p className="ai-card__text">The Markdown copy holds text the PDF does not show. An ATS or an AI reads it:</p>
      <ul className="ai-card__list">
        {[...comparison.linesNotInPdf, ...comparison.addressesNotInPdf].map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

export function ValidationCard({ report }: { report: FileReport }) {
  return (
    <section className="ai-card" aria-label={`Validation of ${report.file}`}>
      <p className="ai-card__head">
        <span className={`ai-mark ai-mark--${report.ok ? 'verified' : 'mismatch'}`}>{report.ok ? 'Valid' : 'Invalid'}</span>
        <span className="ai-card__meta">{report.file} · {report.level}{report.specVersion ? ` · cv ${report.specVersion}` : ''}</span>
      </p>
      <Issues issues={report.issues} />
      {report.payloads ? <Payloads payloads={report.payloads} /> : null}
      {report.embeddingModels?.length ? (
        <p className="ai-card__meta">Embeddings: {report.embeddingModels.join(', ')}</p>
      ) : null}
      {report.markdownVsPdf ? <Comparison comparison={report.markdownVsPdf} /> : null}
    </section>
  );
}
