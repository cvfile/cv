// The text layer of a PDF, page by page, read in the browser with pdf.js. pdf.js and its worker load on the
// first call only.

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export async function pdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // pdf.js takes the buffer it is given to its worker, so it reads a copy.
  const document = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const content = await (await document.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '')).join('')
        .replace(/[ \t]+\n/g, '\n').trim());
    }
    return pages;
  } finally {
    await document.destroy();
  }
}
