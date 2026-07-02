/**
 * MCP server exposing the .cv SDK to AI agents: list, validate, read, pack,
 * and semantically search .cv files. Transport-agnostic; cli.ts wires stdio.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  extract,
  extractHtml,
  extractMarkdown,
  inspect,
  pack,
  validate,
  type PackInput,
} from '@cvfile/sdk';
import { embed, type EmbeddingBackend } from '@cvfile/embed';
import { resolveBackend } from './backend.js';
import { describeCvFile, listCvFiles } from './collection.js';
import { searchDirectory } from './search.js';

export interface CvMcpServerOptions {
  /** Embedding model for search/pack; defaults to the spec default (BGE-M3). */
  model?: string;
  /** Bring-your-own embedding backend (used by tests and custom deployments). */
  backend?: EmbeddingBackend;
}

const SERVER_INFO = { name: 'cvfile', version: '0.1.0' };

export function createCvMcpServer(options: CvMcpServerOptions = {}): McpServer {
  const server = new McpServer(SERVER_INFO);
  const backend = () => resolveBackend(options);

  server.registerTool(
    'list_cvs',
    {
      title: 'List .cv files',
      description:
        'Find .cv resume files in a directory and return their metadata (spec version, language, generator, payloads, embedding models).',
      inputSchema: {
        directory: z.string().describe('Directory to scan'),
        recursive: z.boolean().optional().describe('Scan subdirectories too (default true)'),
      },
    },
    async ({ directory, recursive }) => {
      const files = await listCvFiles(directory, recursive ?? true);
      const listings = await Promise.all(files.map(describeCvFile));
      return jsonContent(listings);
    },
  );

  server.registerTool(
    'validate_cv',
    {
      title: 'Validate a .cv file',
      description:
        'Run spec conformance validation on a .cv file and return the issue report. Use strict mode for full PDF/A-3u checks.',
      inputSchema: {
        path: z.string().describe('Path to the .cv file'),
        strict: z.boolean().optional().describe('cv-strict instead of cv-lenient (default false)'),
      },
    },
    async ({ path, strict }) => {
      const report = await validate(await readFile(path), { strict: strict ?? false });
      return jsonContent(report);
    },
  );

  server.registerTool(
    'read_cv',
    {
      title: 'Read a .cv payload',
      description:
        'Extract a payload from a .cv file: markdown (the canonical resume text), json (JSON Resume), html, or metadata.',
      inputSchema: {
        path: z.string().describe('Path to the .cv file'),
        part: z.enum(['markdown', 'json', 'html', 'metadata']).optional().describe('Payload to read (default markdown)'),
      },
    },
    async ({ path, part }) => readCv(path, part ?? 'markdown'),
  );

  server.registerTool(
    'search_cvs',
    {
      title: 'Semantic search over .cv files',
      description:
        'Rank resume chunks across all .cv files in a directory against a natural-language query, using the embeddings stored inside each file. Returns the best-matching chunks with their source file and score.',
      inputSchema: {
        directory: z.string().describe('Directory containing .cv files'),
        query: z.string().describe('Natural-language query, e.g. "Go developer with payments experience"'),
        k: z.number().int().min(1).max(50).optional().describe('Number of results (default 5)'),
        recursive: z.boolean().optional().describe('Scan subdirectories too (default true)'),
      },
    },
    async ({ directory, query, k, recursive }) => {
      const result = await searchDirectory({
        directory,
        query,
        backendFor: (model) => resolveBackend({ ...options, model: options.model ?? model }),
        ...(k !== undefined ? { k } : {}),
        ...(recursive !== undefined ? { recursive } : {}),
      });
      return jsonContent(result);
    },
  );

  server.registerTool(
    'pack_cv',
    {
      title: 'Pack a .cv file',
      description:
        'Create a .cv file from an existing PDF (the visual layer) plus resume payloads: markdown and optionally JSON Resume and HTML. Optionally generate and embed semantic vectors.',
      inputSchema: {
        pdfPath: z.string().describe('Path to the rendered resume PDF'),
        outputPath: z.string().describe('Where to write the .cv file'),
        markdownPath: z.string().describe('Path to the resume markdown'),
        jsonPath: z.string().optional().describe('Path to a JSON Resume file'),
        htmlPath: z.string().optional().describe('Path to an HTML rendering'),
        language: z.string().optional().describe('BCP 47 primary language (default "en")'),
        embeddings: z.boolean().optional().describe('Generate and embed semantic vectors (default false)'),
      },
    },
    async (args) => {
      const metadata = await packCv(args, backend);
      return jsonContent({ written: args.outputPath, metadata });
    },
  );

  return server;
}

interface PackArgs {
  pdfPath: string;
  outputPath: string;
  markdownPath: string;
  jsonPath?: string | undefined;
  htmlPath?: string | undefined;
  language?: string | undefined;
  embeddings?: boolean | undefined;
}

async function packCv(args: PackArgs, backend: () => EmbeddingBackend) {
  const markdown = await readFile(args.markdownPath, 'utf8');
  const input: PackInput = {
    pdf: await readFile(args.pdfPath),
    markdown,
    metadata: { primaryLanguage: args.language ?? 'en' },
  };
  if (args.jsonPath) input.json = JSON.parse(await readFile(args.jsonPath, 'utf8'));
  if (args.htmlPath) input.html = await readFile(args.htmlPath, 'utf8');
  if (args.embeddings) input.embeddings = await embed(markdown, { backend: backend() });
  const bytes = await pack(input);
  await writeFile(args.outputPath, bytes);
  return inspect(bytes);
}

async function readCv(path: string, part: 'markdown' | 'json' | 'html' | 'metadata') {
  const bytes = await readFile(path);
  if (part === 'metadata') return jsonContent(await inspect(bytes));
  if (part === 'markdown') return textContent((await extractMarkdown(bytes)) ?? missing(part));
  if (part === 'html') return textContent((await extractHtml(bytes)) ?? missing(part));
  const file = await extract(bytes);
  const json = file.payloads.find((p) => p.name === 'resume.json');
  return textContent(json ? json.text() : missing(part));
}

function missing(part: string): string {
  return `No ${part} payload in this file`;
}

function jsonContent(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function textContent(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}
