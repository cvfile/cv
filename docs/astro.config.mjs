import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cvfile.org',
  output: 'static',
  build: {
    format: 'directory',
  },
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
