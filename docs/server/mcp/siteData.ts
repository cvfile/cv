// The data the docs tools read, written by scripts/build-docs-index.mjs when the site is built and read
// once when the server starts.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SiteIndex } from '../search/siteIndex.mjs';

export interface PackageInfo {
  name: string;
  registry: string;
  language: 'javascript' | 'python' | 'go' | 'cli';
  install: string;
  summary: string;
  url: string;
  released: boolean;
  version: string;
}

export interface SiteData {
  index: SiteIndex;
  packages: PackageInfo[];
}

export function loadSiteData(dataDir: string): SiteData {
  const read = (file: string) => JSON.parse(readFileSync(path.join(dataDir, file), 'utf8'));
  return { index: read('docs-index.json'), packages: read('packages.json') };
}
