// The API behind cvfile.org's static pages: the routes by path and method. nginx sends it /api/ and the
// health check reaches it on /healthz.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createEventsRoute } from './events/eventsRoute.ts';
import { methodNotAllowed, notFound, sendJson } from './http/responses.ts';
import { createMcpRoute } from './mcp/mcpRoute.ts';
import type { SiteData } from './mcp/siteData.ts';
import { createToolLog } from './mcp/toolLog.ts';
import type { ToolLog } from './mcp/toolLog.ts';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

export interface AppOptions {
  data: SiteData;
  origins: ReadonlySet<string>;
  log?: ToolLog;
  writeEvent?: (line: string) => void;
}

export function createApp({ data, origins, log = createToolLog(), writeEvent }: AppOptions): Handler {
  const posts: Record<string, Handler> = {
    '/api/mcp': createMcpRoute(data, log),
    '/api/events': createEventsRoute({ origins, write: writeEvent }),
  };
  return async function handle(req, res) {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }
    const route = posts[pathname];
    if (!route) {
      notFound(res);
      return;
    }
    if (req.method !== 'POST') {
      methodNotAllowed(res);
      return;
    }
    await route(req, res);
  };
}
