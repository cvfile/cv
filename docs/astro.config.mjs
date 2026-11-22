import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// The API of the AI mode (server/main.ts) in development, on the port the folder name gives (cv: 6736); the
// site itself runs on 6737. In production nginx sends /api/ to it.
const DEV_API = 'http://localhost:6736';

export default defineConfig({
  site: 'https://cvfile.org',
  output: 'static',
  build: {
    format: 'directory',
  },
  integrations: [react(), sitemap({ filter: (page) => !page.includes('/aiconnect/') })],
  env: {
    schema: {
      // The TensorPass site key of the domain the pages are built for, which offers the TensorPass sign in to
      // visitors without AI Wallet. It is public and goes into the pages; the build fails without it.
      PUBLIC_TENSORPASS_SITE_KEY: envField.string({ context: 'client', access: 'public' }),
    },
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
      proxy: {
        '/api/': DEV_API,
      },
    },
  },
});
