import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'render-pdf': 'src/render-pdf.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  // Code splitting lets the dynamic `import('./render-pdf.js')` become its own
  // chunk, so heavy pdf.js loads on demand instead of bloating the entry.
  splitting: true,
  treeshake: true,
});
