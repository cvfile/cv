// Writes the Content-Security-Policy of the built site as an nginx directive, once Astro has built the
// pages: the policy of scripts/content-security-policy/policy.mjs with the hashes of the pages' inline
// scripts. The image copies the file beside nginx's configuration (docs/Dockerfile), which includes it.
//
//   node scripts/build-csp.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteScriptHashes } from './content-security-policy/inlineScripts.mjs';
import { contentSecurityPolicy, nginxHeader } from './content-security-policy/policy.mjs';

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(docsDir, 'vps/dist');

const hashes = siteScriptHashes(path.join(docsDir, 'dist'));
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'content-security-policy.conf'), nginxHeader(contentSecurityPolicy(hashes)));
console.log(`build-csp: ${hashes.length} inline script hashes in vps/dist/content-security-policy.conf`);
