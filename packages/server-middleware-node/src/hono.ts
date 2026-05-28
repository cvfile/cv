import type { Context, MiddlewareHandler } from 'hono';
import { isCvFile } from '@cvfile/sdk';
import type { ServeFormat } from './conneg.js';
import { buildCvResponse } from './response.js';

export interface CvHonoOptions {
  loader: (logicalPath: string) => Promise<Uint8Array | null>;
  cacheControl?: string;
  defaultFormat?: ServeFormat;
}

export function cvHono(options: CvHonoOptions): MiddlewareHandler {
  const { loader, cacheControl = 'public, max-age=300', defaultFormat } = options;
  return async (c: Context) => {
    const url = new URL(c.req.url);
    const logical = decodeURIComponent(url.pathname);
    if (!logical.toLowerCase().endsWith('.cv')) {
      return c.notFound();
    }
    const bytes = await loader(logical);
    if (!bytes) return c.notFound();
    if (!(await isCvFile(bytes))) {
      return c.text('Not a .cv file', 415);
    }

    const built = await buildCvResponse({
      bytes,
      selfUrl: url.pathname,
      accept: c.req.header('accept'),
      acceptLanguage: c.req.header('accept-language'),
      formatQuery: c.req.query('format') ?? undefined,
      defaultFormat,
      cacheControl,
      ifNoneMatch: c.req.header('if-none-match'),
      ifModifiedSince: c.req.header('if-modified-since'),
    });

    if (built.status === 304) {
      return c.body(null, 304, built.headers);
    }
    const view = new Uint8Array(built.body.byteLength);
    view.set(built.body);
    return c.newResponse(view.buffer, 200, built.headers);
  };
}
