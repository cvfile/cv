import { defineConfig } from 'tsup';

const shared = {
  sourcemap: true,
  target: 'es2022',
  splitting: false,
  treeshake: true,
  external: ['@huggingface/transformers'],
} as const;

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  {
    // The bin is ESM-only: it uses top-level await, and Node resolves the
    // .js extension as ESM here because package.json sets "type": "module".
    ...shared,
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    clean: false,
  },
]);
