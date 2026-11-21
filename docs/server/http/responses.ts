// The answers the API writes on a Node response, and the request facts its routes read: the visitor's
// address as Caddy reports it and the page's origin.

import type { IncomingMessage, ServerResponse } from 'node:http';

const NO_STORE = { 'Cache-Control': 'no-store' };

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE, ...headers });
  res.end(JSON.stringify(body));
}

export function sendEmpty(res: ServerResponse, status: number) {
  res.writeHead(status, NO_STORE);
  res.end();
}

export function methodNotAllowed(res: ServerResponse) {
  sendJson(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
}

export function notFound(res: ServerResponse) {
  sendJson(res, 404, { error: 'Not found' });
}

// The JSON-RPC error an MCP client reads, with the time it waits before its next request.
export function tooManyRequests(res: ServerResponse, retryAfterSeconds: number) {
  sendJson(
    res,
    429,
    { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests, retry later.' } },
    { 'Retry-After': String(retryAfterSeconds) },
  );
}

// Caddy overwrites X-Real-IP with the Cloudflare visitor or the connection's address, and nginx in front of
// this process passes it on, so a value the visitor sends never reaches here.
export function visitorAddress(req: IncomingMessage): string {
  const header = req.headers['x-real-ip'];
  return (Array.isArray(header) ? header[0] : header)?.trim() || 'unknown';
}

export function requestOrigin(req: IncomingMessage): string | undefined {
  return req.headers.origin;
}

// The body of a small JSON request, read up to `maxBytes` whatever length the request declares. Answers
// null for a body too large or not JSON.
export async function readSmallJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      return null;
    }
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}
