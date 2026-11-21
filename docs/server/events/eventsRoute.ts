// POST /api/events: the two anonymous counters of the builder's AI draft, `draft_filled` when the assistant
// writes a draft into the editor and `cv_built` when the visitor then builds the file. The body is one
// field, no identifier, no cookie and no file text; each event is one line of the container's log, which
// the maintainer counts. Only the site's own pages may post, from an origin of `origins`.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRateLimit } from '../http/rateLimit.mjs';
import {
  readSmallJson, requestOrigin, sendEmpty, sendJson, tooManyRequests, visitorAddress,
} from '../http/responses.ts';

export const SITE_EVENTS = ['draft_filled', 'cv_built'] as const;
export type SiteEvent = (typeof SITE_EVENTS)[number];

const MAX_BODY_BYTES = 256;

export function parseSiteEvent(body: unknown): SiteEvent | null {
  const event = (body as { event?: unknown } | null)?.event;
  return SITE_EVENTS.find((known) => known === event) ?? null;
}

interface EventsRouteOptions {
  origins: ReadonlySet<string>;
  write?: (line: string) => void;
}

export function createEventsRoute({ origins, write = (line) => process.stdout.write(`${line}\n`) }: EventsRouteOptions) {
  const rateLimit = createRateLimit({ limit: 20, windowMs: 60_000 });
  return async function handleEvent(req: IncomingMessage, res: ServerResponse) {
    const origin = requestOrigin(req);
    if (!origin || !origins.has(origin)) {
      sendJson(res, 403, { error: 'Unknown origin' });
      return;
    }
    const allowed = rateLimit(visitorAddress(req));
    if (!allowed.ok) {
      tooManyRequests(res, allowed.retryAfterSeconds);
      return;
    }
    const event = parseSiteEvent(await readSmallJson(req, MAX_BODY_BYTES));
    if (!event) {
      sendJson(res, 400, { error: 'Unknown event' });
      return;
    }
    write(JSON.stringify({ at: new Date().toISOString(), event }));
    sendEmpty(res, 204);
  };
}
