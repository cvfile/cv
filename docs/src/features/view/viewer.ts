// The viewer of /view/: a .cv file dropped, chosen or loaded from the sample opens in <cv-embed>, and is
// shared with the AI mode's file assistant, which the "Ask about this file" button opens once a file is
// loaded. The file stays in the browser.

import '@cvfile/viewer-web';
import { droppedCv } from '../ai-mode/files/droppedFiles.ts';
import { openAssistant } from '../ai-mode/openAssistant.ts';

type Viewer = HTMLElement & { loadFromBytes(bytes: Uint8Array): Promise<void> };

const SAMPLE = { url: '/samples/jane-doe.cv', name: 'jane-doe.cv' };

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function open(file: Blob, name: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  droppedCv.set({ name, bytes });
  byId('dropzone').hidden = true;
  const viewer = byId<Viewer>('viewer');
  viewer.hidden = false;
  byId('ask-file').hidden = false;
  await viewer.loadFromBytes(bytes);
}

function bindDropzone() {
  const zone = byId('dropzone');
  const picker = byId<HTMLInputElement>('picker');
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    if (file) {
      void open(file, file.name);
    }
  });
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('over');
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void open(file, file.name);
    }
  });
}

function bindSample() {
  const button = byId<HTMLButtonElement>('load-sample');
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Loading sample…';
    try {
      const response = await fetch(SAMPLE.url);
      await open(await response.blob(), SAMPLE.name);
    } finally {
      button.disabled = false;
      button.textContent = 'Load sample .cv';
    }
  });
}

export function startViewer() {
  bindDropzone();
  bindSample();
  byId('ask-file').addEventListener('click', openAssistant);
}
