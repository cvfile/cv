import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, '..', 'dist', 'cdn', 'cv-embed.js');

describe('cdn bundle (dist/cdn/cv-embed.js)', () => {
  it('exists as a build output', () => {
    expect(existsSync(bundlePath), 'run `pnpm build` first; the CDN bundle is a build output').toBe(true);
  });

  it('imports in a DOM environment and defines <cv-embed>', async () => {
    const mod = await import(/* @vite-ignore */ pathToFileURL(bundlePath).href);
    expect(customElements.get('cv-embed')).toBeDefined();
    expect(typeof mod.CvEmbed).toBe('function');
  });
});
