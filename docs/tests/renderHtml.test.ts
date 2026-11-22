// The resume.html the builder packs: raw HTML is escaped and a link keeps only a safe address.

import { describe, expect, it } from 'vitest';
import { renderHtml } from '../src/features/create/renderHtml.ts';

describe('renderHtml', () => {
  it('escapes raw HTML', async () => {
    const html = await renderHtml('# Jane\n\n<img src=x onerror=alert(1)>', 'Jane', 'en');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('keeps web, mail and relative links', async () => {
    const html = await renderHtml('[site](https://jane.example) [mail](mailto:jane@doe.example) [cv](#top)', 'J', 'en');
    expect(html).toContain('href="https://jane.example"');
    expect(html).toContain('href="mailto:jane@doe.example"');
    expect(html).toContain('href="#top"');
  });

  it('turns a script or data link into its text', async () => {
    const markdown = '[a](javascript:alert(1)) [b](JaVa\tScript:alert(1)) <javascript:alert(1)> '
      + '[c](data:text/html,<script>alert(1)</script>)';
    const html = await renderHtml(markdown, 'J', 'en');
    expect(html).not.toMatch(/href="(?:javascript|data)/i);
    expect(html).not.toContain('<a');
  });
});
