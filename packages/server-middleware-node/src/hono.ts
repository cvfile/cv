import type { Context, MiddlewareHandler } from 'hono';
import { isCvFile } from '@cvfile/sdk';
import { buildLinkHeader, PDF_PRIMARY_MIME } from './conneg.js';
import { serveCv } from './serve.js';

export interface CvHonoOptions {
  loader: (logicalPath: string) => Promise<Uint8Array | null>;
  cacheControl?: string;
}

export function cvHono(options: CvHonoOptions): MiddlewareHandler {
  const { loader, cacheControl = 'public, max-age=300' } = options;
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
    const result = await serveCv({
      bytes,
      accept: c.req.header('accept'),
      acceptLanguage: c.req.header('accept-language'),
      formatQuery: c.req.query('format') ?? undefined,
    });
    const link = buildLinkHeader({ selfUrl: url.pathname, cvMime: PDF_PRIMARY_MIME });
    const headers: Record<string, string> = {
      'Content-Type': result.contentType,
      Vary: 'Accept, Accept-Language',
      Link: link,
      'Cache-Control': cacheControl,
    };
    if (result.language) headers['Content-Language'] = result.language;
    const view = new Uint8Array(result.body.byteLength);
    view.set(result.body);
    return c.newResponse(view.buffer, 200, headers);
  };
}
