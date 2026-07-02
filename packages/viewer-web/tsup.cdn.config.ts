import { readFile } from 'node:fs/promises';
import { defineConfig, type Options } from 'tsup';

type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number];

/**
 * Resolves `<specifier>?inline` imports to the target module's raw source
 * text. Used to inline the pdf.js worker into the single-file CDN bundle so
 * it never depends on a sibling worker file next to the module URL.
 */
const inlineTextPlugin: EsbuildPlugin = {
  name: 'inline-text',
  setup(build) {
    build.onResolve({ filter: /\?inline$/ }, async (args) => {
      const resolved = await build.resolve(args.path.replace(/\?inline$/, ''), {
        kind: 'import-statement',
        resolveDir: args.resolveDir,
      });
      if (resolved.errors.length > 0) {
        return { errors: resolved.errors };
      }
      return { path: resolved.path, namespace: 'inline-text' };
    });
    build.onLoad({ filter: /.*/, namespace: 'inline-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

/**
 * CDN build: one fully self-contained browser ESM file at dist/cdn/cv-embed.js
 * (the artifact behind https://cvfile.org/embed/1/cv-embed.js). Runs after the
 * regular package build; see the `build` script in package.json.
 */
export default defineConfig({
  entry: { 'cv-embed': 'src/cdn.ts' },
  outDir: 'dist/cdn',
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  dts: false,
  splitting: false,
  treeshake: true,
  clean: false,
  noExternal: [/.*/],
  esbuildPlugins: [inlineTextPlugin],
});
