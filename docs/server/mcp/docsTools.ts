// The docs tools of cvfile.org's MCP server: search the docs, read one document, list the packages. They
// read published content only, check no session, and every result passes the server policy before it
// leaves, since anyone can call them without the page.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkToolResult } from '@tensorpass/aiconnect';
import { chatPolicy } from '../chatPolicy.server.mjs';
import { pageText, searchIndex } from '../search/siteIndex.mjs';
import type { SiteData } from './siteData.ts';
import type { ToolLog } from './toolLog.ts';

const PASSAGE_CHARS = 700;
const PAGE_CHARS = 6000;
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const LANGUAGES = ['javascript', 'python', 'go', 'cli'] as const;

const text = (value: string, isError = false) => ({ content: [{ type: 'text' as const, text: value }], isError });

const checked = (value: string) => (checkToolResult(value, chatPolicy).ok
  ? text(value)
  : text('This result is not available.', true));

function registerSearch(server: McpServer, data: SiteData, log: ToolLog) {
  server.registerTool('search_docs', {
    title: 'Search the .cv docs',
    description: 'Search the .cv specification, the pages of cvfile.org and the READMEs of the SDKs, CLI, server '
      + 'middleware, viewer, MCP server and RAG loaders. Returns up to `limit` passages as JSON, each with its '
      + 'title, section heading, path (for read_doc_page), url (to link) and text. If nothing matches, the answer '
      + 'is [] and a shorter query or another word is the next try.',
    inputSchema: {
      query: z.string().min(2).max(200).describe('Words to look for, such as "integrity digest" or "LlamaIndex"'),
      limit: z.number().int().min(1).max(8).default(5).describe('How many passages to return'),
    },
    annotations: READ_ONLY,
  }, async ({ query, limit }) => {
    const hits = searchIndex(data.index, query, limit).map((hit) => ({ ...hit, text: hit.text.slice(0, PASSAGE_CHARS) }));
    log.search(query, hits.length);
    return checked(JSON.stringify(hits));
  });
}

function registerReadPage(server: McpServer, data: SiteData, log: ToolLog) {
  server.registerTool('read_doc_page', {
    title: 'Read one docs page',
    description: 'The text of one document of the docs index, by the path search_docs returned, such as /install/, '
      + '/spec/#s4 or packages/sdk-js/README.md. Long documents are cut at 6,000 characters.',
    inputSchema: { path: z.string().min(1).max(200).describe('The path search_docs returned') },
    annotations: READ_ONLY,
  }, async ({ path }) => {
    log.call('read_doc_page');
    const page = pageText(data.index, path);
    return page
      ? checked(JSON.stringify({ ...page, text: page.text.slice(0, PAGE_CHARS) }))
      : text('No document at this path. Use a path search_docs returned.', true);
  });
}

function registerListPackages(server: McpServer, data: SiteData, log: ToolLog) {
  server.registerTool('list_packages', {
    title: 'List the .cv packages',
    description: 'Every package of the .cv format with its registry, current version, install command, language, '
      + 'one line on what it does and its page url. Give `language` only when the visitor named one: javascript '
      + '(npm packages), python (PyPI packages), go (the Go SDK) or cli (the cv command line tool).',
    inputSchema: { language: z.enum(LANGUAGES).optional().describe('The visitor\'s language or tool, if named') },
    annotations: READ_ONLY,
  }, async ({ language }) => {
    log.call('list_packages');
    const packages = language ? data.packages.filter((entry) => entry.language === language) : data.packages;
    return checked(JSON.stringify(packages));
  });
}

export function createDocsServer(data: SiteData, log: ToolLog): McpServer {
  const server = new McpServer({ name: 'cvfile-docs', version: '1.0.0' });
  registerSearch(server, data, log);
  registerReadPage(server, data, log);
  registerListPackages(server, data, log);
  return server;
}
