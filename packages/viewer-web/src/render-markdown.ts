import DOMPurify from 'dompurify';
import { marked } from 'marked';

let hooked = false;

/**
 * Force every rendered anchor to open safely. Markdown links point at
 * untrusted, author-supplied URLs, so we add `rel="noopener noreferrer"` to
 * sever any `window.opener` link and suppress referrer leakage.
 */
function ensureLinkHardening(): void {
  if (hooked) return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof HTMLAnchorElement) {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  hooked = true;
}

export function renderMarkdown(source: string): string {
  ensureLinkHardening();
  const raw = marked.parse(source, { async: false }) as string;
  // DOMPurify's `html` profile is a safe positive allowlist on its own: it
  // strips scripting elements, event-handler attributes, and dangerous URI
  // schemes by default. A partial FORBID_* blocklist on top is misleading, so
  // we rely on the profile and harden links via the hook above.
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
  });
}
