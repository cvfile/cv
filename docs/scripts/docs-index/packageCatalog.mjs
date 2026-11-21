// The packages list_packages answers with: the table "Packages and SDKs" of README.md, each entry with the
// file its version is read from when the docs are built. The Go SDK and the cv CLI are versioned by git tag
// only, so they answer with the latest release of their registry.

import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {'javascript' | 'python' | 'go' | 'cli'} Language
 * @typedef {{ name: string, registry: string, language: Language, install: string, summary: string,
 *   url: string, versionFrom?: string, released?: boolean }} CatalogEntry
 * @typedef {Omit<CatalogEntry, 'versionFrom'> & { version: string }} PackageInfo
 */

const NPM = 'https://www.npmjs.com/package/';
const PYPI = 'https://pypi.org/project/';
const REPOSITORY = 'https://github.com/cvfile/cv';

/** @type {CatalogEntry[]} */
export const PACKAGE_CATALOG = [
  {
    name: '@cvfile/sdk', registry: 'npm', language: 'javascript', install: 'npm install @cvfile/sdk',
    summary: 'Pack, extract, inspect and validate .cv files, in Node and the browser.',
    url: `${NPM}@cvfile/sdk`, versionFrom: 'packages/sdk-js/package.json',
  },
  {
    name: '@cvfile/embed', registry: 'npm', language: 'javascript', install: 'npm install @cvfile/embed',
    summary: 'Markdown chunker and embedding backends (transformers.js, Hugging Face Inference), BGE-M3 by default.',
    url: `${NPM}@cvfile/embed`, versionFrom: 'packages/embed-js/package.json',
  },
  {
    name: '@cvfile/server', registry: 'npm', language: 'javascript', install: 'npm install @cvfile/server',
    summary: 'Content negotiation that serves .cv files to browsers, ATS and AI agents from Express, Fastify, '
      + 'Hono or node:http.',
    url: `${NPM}@cvfile/server`, versionFrom: 'packages/server-middleware-node/package.json',
  },
  {
    name: '@cvfile/viewer-web', registry: 'npm', language: 'javascript', install: 'npm install @cvfile/viewer-web',
    summary: 'The <cv-embed> web component: PDF, Markdown and HTML tabs, also served from '
      + 'https://cvfile.org/embed/1/cv-embed.js.',
    url: `${NPM}@cvfile/viewer-web`, versionFrom: 'packages/viewer-web/package.json',
  },
  {
    name: '@cvfile/mcp', registry: 'source', language: 'javascript',
    install: 'git clone https://github.com/cvfile/cv && cd cv && pnpm install && pnpm --filter @cvfile/mcp build',
    summary: 'MCP server for AI agents on a local machine: list, validate, read, pack and search .cv files. Not '
      + 'yet published on npm.',
    url: `${REPOSITORY}/tree/main/packages/mcp`, versionFrom: 'packages/mcp/package.json', released: false,
  },
  {
    name: '@cvfile/cv-detector', registry: 'npm', language: 'javascript', install: 'npm install @cvfile/cv-detector',
    summary: 'Dependency free sniffer that detects a .cv inside any PDF and unwraps its Markdown payload.',
    url: `${NPM}@cvfile/cv-detector`, versionFrom: 'tools/cv-detector/typescript/package.json',
  },
  {
    name: 'cvfile', registry: 'PyPI', language: 'python', install: 'pip install cvfile',
    summary: 'The Python SDK, with cvfile.embed (pip install "cvfile[embed]") and the ASGI and WSGI middleware '
      + 'cvfile.server.',
    url: `${PYPI}cvfile/`, versionFrom: 'sdks/python/pyproject.toml',
  },
  {
    name: 'langchain-cvfile', registry: 'PyPI', language: 'python', install: 'pip install langchain-cvfile',
    summary: 'LangChain document loader that loads the text and the per chunk vectors of .cv files.',
    url: `${PYPI}langchain-cvfile/`, versionFrom: 'integrations/langchain-cvfile/pyproject.toml',
  },
  {
    name: 'llama-index-readers-cvfile', registry: 'PyPI', language: 'python',
    install: 'pip install llama-index-readers-cvfile',
    summary: 'LlamaIndex reader for .cv files.',
    url: `${PYPI}llama-index-readers-cvfile/`, versionFrom: 'integrations/llama-index-readers-cvfile/pyproject.toml',
  },
  {
    name: 'cvfile-haystack', registry: 'PyPI', language: 'python', install: 'pip install cvfile-haystack',
    summary: 'Haystack 2.x converter for .cv files.',
    url: `${PYPI}cvfile-haystack/`, versionFrom: 'integrations/cvfile-haystack/pyproject.toml',
  },
  {
    name: 'cvfile-cv-detector', registry: 'PyPI', language: 'python', install: 'pip install cvfile-cv-detector',
    summary: 'The .cv sniffer for Python crawlers.',
    url: `${PYPI}cvfile-cv-detector/`, versionFrom: 'tools/cv-detector/python/pyproject.toml',
  },
  {
    name: 'github.com/cvfile/cv/sdks/go', registry: 'Go modules', language: 'go',
    install: 'go get github.com/cvfile/cv/sdks/go@latest',
    summary: 'The Go SDK: pack, extract, inspect, validate, and net/http middleware.',
    url: 'https://pkg.go.dev/github.com/cvfile/cv/sdks/go',
  },
  {
    name: 'cv', registry: 'Homebrew, Scoop', language: 'cli', install: 'brew install cvfile/tap/cv',
    summary: 'Single Go binary that packs, extracts, inspects, validates and searches .cv files. On Windows: scoop bucket '
      + 'add cvfile https://github.com/cvfile/scoop-bucket, then scoop install cv.',
    url: `${REPOSITORY}/releases`,
  },
];

// The version a manifest declares: "version" of a package.json, `version = "..."` of a pyproject.toml.
/** @param {string} file @param {string} source @returns {string} */
export function manifestVersion(file, source) {
  const version = file.endsWith('.json')
    ? JSON.parse(source).version
    : /^version\s*=\s*"([^"]+)"/m.exec(source)?.[1];
  if (!version) {
    throw new Error(`No version in ${file}`);
  }
  return version;
}

/** @param {string} rootDir @returns {PackageInfo[]} */
export function resolvePackages(rootDir) {
  return PACKAGE_CATALOG.map(({ versionFrom, released = true, ...entry }) => ({
    ...entry,
    released,
    version: versionFrom ? manifestVersion(versionFrom, readFileSync(path.join(rootDir, versionFrom), 'utf8')) : 'latest',
  }));
}
