// Starts cvfile.org's API. Its settings come from the environment:
//   PORT           the port it listens on
//   SITE_DATA_DIR  the folder of docs-index.json and packages.json (scripts/build-docs-index.mjs)
//   SITE_ORIGINS   the origins whose pages may post events, comma separated

import { createServer } from 'node:http';
import { createApp } from './app.ts';
import { sendJson } from './http/responses.ts';
import { loadSiteData } from './mcp/siteData.ts';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

const port = Number(required('PORT'));
const data = loadSiteData(required('SITE_DATA_DIR'));
const origins = new Set(required('SITE_ORIGINS').split(',').map((origin) => origin.trim()));
const app = createApp({ data, origins });

const server = createServer((req, res) => {
  Promise.resolve(app(req, res)).catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal error' });
    }
  });
});

server.listen(port, () => {
  console.log(`cvfile api on port ${port}, ${data.index.passages.length} passages, ${data.packages.length} packages`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
