// Builds the data of the docs MCP server once the site is built: the search index of the built pages, the
// specification and the repository's READMEs, and the package list with the versions of this checkout.
// Every passage is checked with the server policy first, so a document that names something internal fails
// the build here instead of failing a visitor's search.
//
//   node scripts/build-docs-index.mjs [--out server/dist]

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkToolResult } from '@tensorpass/aiconnect';
import { chatPolicy } from '../server/chatPolicy.server.mjs';
import { buildIndex } from '../server/search/siteIndex.mjs';
import { repositoryFiles, sitePages, specSections } from './docs-index/docSources.mjs';
import { resolvePackages } from './docs-index/packageCatalog.mjs';

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(docsDir, '..');
const outFlag = process.argv.indexOf('--out');
const outDir = path.resolve(docsDir, outFlag > -1 ? process.argv[outFlag + 1] : 'server/dist');

const documents = [...sitePages(path.join(docsDir, 'dist')), ...specSections(rootDir), ...repositoryFiles(rootDir)];
const index = buildIndex(documents);
const packages = resolvePackages(rootDir);

const refused = index.passages.filter((passage) => !checkToolResult(JSON.stringify(passage), chatPolicy).ok);
if (refused.length) {
  for (const passage of refused) {
    console.error(`build-docs-index: ${passage.path} (${passage.heading}) names something the policy denies`);
  }
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'docs-index.json'), JSON.stringify(index));
writeFileSync(path.join(outDir, 'packages.json'), JSON.stringify(packages));
console.log(`build-docs-index: ${documents.length} documents, ${index.passages.length} passages, `
  + `${packages.length} packages in ${path.relative(docsDir, outDir)}`);
