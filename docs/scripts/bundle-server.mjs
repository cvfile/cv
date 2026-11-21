// Bundles the API (server/main.ts and its dependencies) into one file, server/dist/server.mjs, which the
// image runs with Node and no node_modules. The MCP SDK pulls CommonJS modules (ajv), so the bundle gets
// a require of its own.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(docsDir, 'server/main.ts')],
  outfile: path.join(docsDir, 'server/dist/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'warning',
});
console.log('bundle-server: server/dist/server.mjs');
