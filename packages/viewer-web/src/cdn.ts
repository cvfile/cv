/**
 * Self-contained browser bundle served at https://cvfile.org/embed/1/cv-embed.js.
 * Every dependency (lit, marked, dompurify, @cvfile/sdk, pdf.js) is inlined so
 * the file works from any static host with a single module script tag.
 *
 * A single-file bundle cannot resolve the pdf.js worker as a sibling file of
 * the module URL, so the worker's source is inlined as text (see the
 * inline-text plugin in tsup.cdn.config.ts) and handed to pdf.js through a
 * same-origin blob URL. When blob URLs are unavailable pdf.js falls back to
 * its built-in main-thread ("fake worker") mode using that same source.
 */
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?inline';
import { setWorkerSrc } from './render-pdf.js';
import './index.js';

if (typeof window !== 'undefined' && typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function') {
  const workerBlob = new Blob([workerSource], { type: 'text/javascript' });
  setWorkerSrc(URL.createObjectURL(workerBlob));
}

export { CvEmbed } from './cv-embed.js';
