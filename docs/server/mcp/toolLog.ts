// What the server keeps of the tool calls: one JSON line per call in the container's log, with the tool's
// name and the time, and the query of a search that found nothing, so the maintainer sees the docs that are
// missing. No visitor address and no other argument is written.

export interface ToolLog {
  call: (tool: string) => void;
  search: (query: string, hits: number) => void;
}

export function createToolLog(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): ToolLog {
  const entry = (fields: Record<string, unknown>) => write(JSON.stringify({ at: new Date().toISOString(), ...fields }));
  return {
    call: (tool) => entry({ tool }),
    search: (query, hits) => entry(hits ? { tool: 'search_docs' } : { tool: 'search_docs', emptyQuery: query }),
  };
}
