// The Content-Security-Policy of cvfile.org, which nginx sends with every page (docs/vps/nginx.conf).
//
// Scripts run from the site's own files and the inline scripts of the build, allowed by their hashes. Styles
// keep 'unsafe-inline': Shiki colours the spec's code with style attributes, and the AI mode's panel styles
// its elements at run time. The PDF viewer runs pdf.js in a worker of the site, or from a blob URL when the
// <cv-embed> bundle carries the worker inline. The AI mode calls the site's /api/mcp and /api/events, and its
// web sign ins call OpenRouter and the TensorPass plan gateway from the page; the sign in windows themselves
// are top level navigations, which the policy does not govern. Cloudflare, which proxies the site, adds its
// Web Analytics beacon to every page, and the beacon reports to its own host. Images and fonts of a resume
// come from the file itself, as data or blob URLs, so a resume opened in the viewer cannot load a tracking
// pixel.

import { PLAN_GATEWAY } from '@tensorpass/aiconnect';

// The OpenRouter API the AI Connect SDK calls for the key exchange and the chat
// (packages/core/src/webAccounts/openRouterAccount.ts of the SDK, which does not export it).
const OPENROUTER = 'https://openrouter.ai';
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';
const WEB_ANALYTICS_SCRIPT = 'https://static.cloudflareinsights.com';
const WEB_ANALYTICS_REPORTS = 'https://cloudflareinsights.com';

/** @param {string[]} scriptHashes the hashes of the build's inline scripts */
export function contentSecurityPolicy(scriptHashes) {
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", WEB_ANALYTICS_SCRIPT, ...scriptHashes],
    'style-src': ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS],
    'font-src': ["'self'", 'data:', GOOGLE_FONTS_FILES],
    'img-src': ["'self'", 'data:', 'blob:'],
    'connect-src': ["'self'", OPENROUTER, PLAN_GATEWAY, WEB_ANALYTICS_REPORTS],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives).map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

/** The policy as the nginx directive that docs/vps/nginx.conf includes in its server block. */
export const nginxHeader = (policy) => `add_header Content-Security-Policy "${policy}";\n`;
