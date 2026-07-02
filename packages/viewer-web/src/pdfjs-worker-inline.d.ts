/**
 * The `?inline` suffix imports a module's raw source text. It is resolved by
 * the inline-text esbuild plugin in tsup.cdn.config.ts (CDN bundle only).
 */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?inline' {
  const source: string;
  export default source;
}
