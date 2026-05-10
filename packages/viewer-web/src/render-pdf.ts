import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigured = false;

function ensureWorker(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  workerConfigured = true;
}

export interface RenderResult {
  numPages: number;
}

export async function renderPdfPage(
  bytes: Uint8Array,
  pageNumber: number,
  canvas: HTMLCanvasElement,
): Promise<RenderResult> {
  ensureWorker();
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const loadingTask = pdfjsLib.getDocument({ data: view });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);

  const dpr = window.devicePixelRatio || 1;
  const baseViewport = page.getViewport({ scale: 1 });
  const containerWidth = canvas.parentElement?.clientWidth ?? baseViewport.width;
  const targetWidth = Math.min(containerWidth - 32, 900);
  const scale = (targetWidth / baseViewport.width) * dpr;
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D canvas context');
  }
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { numPages: pdf.numPages };
}
