import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cvfile.org',
  output: 'static',
  build: {
    format: 'directory',
  },
  integrations: [sitemap()],
  markdown: {
    syntaxHighlight: 'shiki',
    shikiConfig: { theme: 'github-dark-default' },
  },
  vite: {
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
});
