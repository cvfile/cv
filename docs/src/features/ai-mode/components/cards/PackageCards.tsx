// The install cards of list_packages: each package with its registry, version and install command, and a
// button that copies the command.

import { useState } from 'react';
import type { PackageInfo } from '../../../../../server/mcp/siteData.ts';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => setCopied(true));
  };
  return (
    <button type="button" className="ai-card__copy" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  );
}

export function PackageCards({ packages }: { packages: PackageInfo[] }) {
  return (
    <ul className="ai-cards">
      {packages.map((entry) => (
        <li key={entry.name} className="ai-card">
          <p className="ai-card__head">
            <a href={entry.url} rel="noopener">{entry.name}</a>
            <span className="ai-card__meta">{entry.registry} · {entry.version}</span>
          </p>
          <p className="ai-card__text">{entry.summary}</p>
          <div className="ai-card__command">
            <code>{entry.install}</code>
            <CopyButton text={entry.install} />
          </div>
        </li>
      ))}
    </ul>
  );
}
