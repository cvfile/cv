import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { normalize, resolve, sep } from 'node:path';
import { isCvFile } from '@cvfile/sdk';
import type { ServeFormat } from './conneg.js';
import { buildCvResponse } from './response.js';

export interface CvHandlerOptions {
  root?: string;
  loader?: (logicalPath: string) => Promise<Uint8Array | null>;
  cacheControl?: string;
  defaultFormat?: ServeFormat;
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

      const loaded = await load(logical, { baseRoot, loader });
      if (!loaded) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      if (!(await isCvFile(loaded.bytes))) {
        res.statusCode = 415;
        res.end('Not a .cv file');
        return;
      }

      const built = await buildCvResponse({
        bytes: loaded.bytes,
        selfUrl: url.pathname,
        accept: req.headers['accept'],
        acceptLanguage: req.headers['accept-language'],
        formatQuery: url.searchParams.get('format') ?? undefined,
        defaultFormat,
        cacheControl,
        lastModified: loaded.lastModified,
        ifNoneMatch: req.headers['if-none-match'],
        ifModifiedSince: req.headers['if-modified-since'],
      });

      for (const [name, value] of Object.entries(built.headers)) {
        res.setHeader(name, value);
      }
      res.statusCode = built.status;
      res.end(built.status === 304 ? undefined : Buffer.from(built.body));
    } catch {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  };
}

interface LoadOpts {
  baseRoot: string | null;
  loader?: ((logicalPath: string) => Promise<Uint8Array | null>) | undefined;
}

interface LoadedFile {
  bytes: Uint8Array;
  lastModified?: Date | undefined;
}

async function load(logicalPath: string, { baseRoot, loader }: LoadOpts): Promise<LoadedFile | null> {
  if (loader) {
    const bytes = await loader(logicalPath);
    return bytes ? { bytes } : null;
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
    return { bytes: new Uint8Array(await readFile(full)), lastModified: s.mtime };
  } catch {
    return null;
  }
}

function isWithin(parent: string, child: string): boolean {
  const rel = resolve(child);
  const base = resolve(parent);
  return rel === base || rel.startsWith(base + sep);
}
