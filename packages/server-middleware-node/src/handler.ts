import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { normalize, resolve, sep } from 'node:path';
import { isCvFile } from '@cvfile/sdk';
import { buildLinkHeader, PDF_PRIMARY_MIME } from './conneg.js';
import { serveCv } from './serve.js';

export interface CvHandlerOptions {
  root?: string;
  loader?: (logicalPath: string) => Promise<Uint8Array | null>;
  cacheControl?: string;
  defaultFormat?: 'pdf' | 'markdown' | 'html';
}

export type CvHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export function cvHandler(options: CvHandlerOptions = {}): CvHandler {
  const { root, loader, cacheControl = 'public, max-age=300', defaultFormat } = options;
  if (!root && !loader) {
    throw new Error('cvHandler requires either { root } or { loader }');
  }

  const baseRoot = root ? resolve(root) : null;

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const logical = decodeURIComponent(url.pathname);
      const formatQuery = url.searchParams.get('format') ?? defaultFormat;

      const bytes = await load(logical, { baseRoot, loader });
      if (!bytes) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      if (!(await isCvFile(bytes))) {
        res.statusCode = 415;
        res.end('Not a .cv file');
        return;
      }

      const result = await serveCv({
        bytes,
        accept: req.headers['accept'],
        acceptLanguage: req.headers['accept-language'],
        formatQuery: formatQuery ?? undefined,
      });

      const link = buildLinkHeader({ selfUrl: url.pathname, cvMime: PDF_PRIMARY_MIME });

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Length', String(result.body.length));
      res.setHeader('Vary', 'Accept, Accept-Language');
      res.setHeader('Link', link);
      res.setHeader('Cache-Control', cacheControl);
      if (result.language) {
        res.setHeader('Content-Language', result.language);
      }
      const filename = filenameForFormat(logical, result.format);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.statusCode = 200;
      res.end(Buffer.from(result.body));
    } catch (err) {
      res.statusCode = 500;
      res.end(`cvHandler error: ${(err as Error).message}`);
    }
  };
}

interface LoadOpts {
  baseRoot: string | null;
  loader?: ((logicalPath: string) => Promise<Uint8Array | null>) | undefined;
}

async function load(logicalPath: string, { baseRoot, loader }: LoadOpts): Promise<Uint8Array | null> {
  if (loader) {
    const bytes = await loader(logicalPath);
    return bytes ?? null;
  }
  if (!baseRoot) return null;
  const safe = normalize(logicalPath).replace(/^[/\\]+/, '');
  const full = resolve(baseRoot, safe);
  if (!isWithin(baseRoot, full)) {
    return null;
  }
  try {
    const s = await stat(full);
    if (!s.isFile()) return null;
    return new Uint8Array(await readFile(full));
  } catch {
    return null;
  }
}

function isWithin(parent: string, child: string): boolean {
  const rel = resolve(child);
  const base = resolve(parent);
  return rel === base || rel.startsWith(base + sep);
}

function filenameForFormat(logical: string, format: 'pdf' | 'markdown' | 'html'): string {
  const base = logical.split('/').pop() ?? 'document';
  const stem = base.replace(/\.cv$/i, '').replace(/\.(pdf|md|html)$/i, '') || 'document';
  if (format === 'markdown') return `${stem}.md`;
  if (format === 'html') return `${stem}.html`;
  return `${stem}.cv`;
}

