// POST /api/mcp: the docs MCP server, stateless, one server and one transport per request, answering in
// JSON. Each visitor address gets 60 requests a minute and the transport refuses a body over 16 KB as it
// reads it. The route reads no cookie and changes nothing, so any origin may call it, as an MCP connector
// in Claude or ChatGPT does.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRateLimit } from '../http/rateLimit.mjs';
import { tooManyRequests, visitorAddress } from '../http/responses.ts';
import { createDocsServer } from './docsTools.ts';
import type { SiteData } from './siteData.ts';
import type { ToolLog } from './toolLog.ts';

export const MCP_MAX_BODY_BYTES = 16_384;

export function createMcpRoute(data: SiteData, log: ToolLog) {
  const rateLimit = createRateLimit({ limit: 60, windowMs: 60_000 });
  return async function handleMcp(req: IncomingMessage, res: ServerResponse) {
    const allowed = rateLimit(visitorAddress(req));
    if (!allowed.ok) {
      tooManyRequests(res, allowed.retryAfterSeconds);
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: MCP_MAX_BODY_BYTES,
    });
    const server = createDocsServer(data, log);
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };
}
