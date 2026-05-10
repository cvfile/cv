import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(here, 'demo'),
  server: {
    port: 5173,
    open: false,
    fs: { allow: [resolve(here, '..'), resolve(here, '../..')] },
  },
  build: { outDir: resolve(here, 'dist-demo'), emptyOutDir: true },
  optimizeDeps: { include: ['pdfjs-dist'] },
});
