// The policy nginx sends: every inline script the browser runs is allowed by its hash, and nothing else is.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inlineScriptHashes } from '../scripts/content-security-policy/inlineScripts.mjs';
import { contentSecurityPolicy } from '../scripts/content-security-policy/policy.mjs';

const hashOf = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

describe('inlineScriptHashes', () => {
  it('hashes the inline scripts a browser runs, and only those', () => {
    const html = '<html><head><script>a()</script><script type="module">b()</script>'
      + '<script type="application/ld+json">{"x":1}</script><script src="/c.js"></script></head></html>';
    expect(inlineScriptHashes(html)).toEqual([hashOf('a()'), hashOf('b()')]);
  });
});

describe('contentSecurityPolicy', () => {
  it('allows the hashed scripts, the API, the web sign ins and the Cloudflare beacon', () => {
    const policy = contentSecurityPolicy([hashOf('a()')]);
    expect(policy).toContain(`script-src 'self' https://static.cloudflareinsights.com ${hashOf('a()')};`);
    expect(policy).toContain(
      "connect-src 'self' https://openrouter.ai https://plan.tensorpass.app https://cloudflareinsights.com;",
    );
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });
});
