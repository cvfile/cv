// The pages an answer drew on: one link per document search_docs returned, with the section it found.

interface DocHit {
  title: string;
  heading: string;
  url: string;
}

export function DocLinks({ hits }: { hits: DocHit[] }) {
  const unique = [...new Map(hits.map((hit) => [`${hit.url} ${hit.heading}`, hit])).values()].slice(0, 6);
  return (
    <nav className="ai-links" aria-label="Sources">
      <p className="ai-card__meta">Sources</p>
      <ul>
        {unique.map((hit) => (
          <li key={`${hit.url} ${hit.heading}`}>
            <a href={hit.url}>{hit.title}</a>
            {hit.heading !== hit.title ? <span className="ai-card__meta"> · {hit.heading}</span> : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
