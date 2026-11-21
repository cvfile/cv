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
      // cvfile.org's TensorPass site key, which offers the TensorPass sign in to visitors without AI Wallet.
      // It is public and works on cvfile.org and localhost; a build for another domain sets its own.
      PUBLIC_TENSORPASS_SITE_KEY: envField.string({ context: 'client', access: 'public', default: 'tpk_xaWoqRg02fzJTx5rFxygmQY-' }),
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
