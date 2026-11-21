// The builder of /create/: the PDF and Markdown the visitor gives, packed in the browser into one .cv file
// with its HTML copy. The dropped PDF is shared with the AI mode's draft assistant, which reads its text in
// the page; nothing reaches cvfile.org.

import { pack } from '@cvfile/sdk';
import { droppedPdf } from '../ai-mode/files/droppedFiles.ts';
import { countBuildAfterDraft } from '../ai-mode/siteEvents.ts';
import { bindDropzone, downloadBytes } from './dropzone.ts';
import { firstHeading, renderHtml } from './renderHtml.ts';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function bindPdf() {
  const zone = byId('pdf-drop');
  const label = byId('pdf-label');
  bindDropzone(zone, byId<HTMLInputElement>('pdf-picker'), async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    droppedPdf.set({ name: file.name, bytes });
    label.textContent = `${file.name} (${(bytes.length / 1024).toFixed(1)} KB)`;
    zone.classList.add('loaded');
  });
}

function bindMarkdown() {
  const zone = byId('md-drop');
  const label = byId('md-label');
  const editor = byId<HTMLTextAreaElement>('md-text');
  bindDropzone(zone, byId<HTMLInputElement>('md-picker'), async (file) => {
    const text = await file.text();
    editor.value = text;
    label.textContent = `${file.name} (${text.length} chars)`;
    zone.classList.add('loaded');
  });
}

function bindTabs() {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((other) => other.classList.toggle('active', other === tab));
      byId('md-paste').hidden = tab.dataset.tab !== 'paste';
      byId('md-drop-panel').hidden = tab.dataset.tab !== 'drop';
    });
  });
}

async function packCv(pdf: Uint8Array, markdown: string): Promise<Uint8Array> {
  const lang = byId<HTMLInputElement>('lang').value.trim() || 'en';
  const html = await renderHtml(markdown, firstHeading(markdown), lang);
  return pack({
    pdf,
    markdown,
    html,
    metadata: { primaryLanguage: lang, primaryPayload: 'resume.md', generator: 'cvfile.org/create', integrity: 'sha-256' },
  });
}

function outputName(): string {
  const name = (byId<HTMLInputElement>('filename').value.trim() || 'resume.cv').replace(/[^a-zA-Z0-9._-]/g, '_');
  return name.endsWith('.cv') ? name : `${name}.cv`;
}

function bindBuild() {
  const button = byId<HTMLButtonElement>('build');
  const status = byId('status');
  button.addEventListener('click', async () => {
    const pdf = droppedPdf.get();
    const markdown = byId<HTMLTextAreaElement>('md-text').value.trim();
    if (!pdf || !markdown) {
      status.textContent = pdf ? 'Paste or drop your Markdown first.' : 'Drop a PDF first.';
      return;
    }
    button.disabled = true;
    try {
      status.textContent = 'Packing .cv…';
      const bytes = await packCv(pdf.bytes, markdown);
      downloadBytes(bytes, outputName());
      countBuildAfterDraft();
      status.textContent = `Done. Packed PDF + Markdown + HTML into ${(bytes.length / 1024).toFixed(1)} KB.`;
    } catch (error) {
      status.textContent = `Failed: ${(error as Error).message}`;
    } finally {
      button.disabled = false;
    }
  });
}

export function startBuilder() {
  bindPdf();
  bindMarkdown();
  bindTabs();
  bindBuild();
}
