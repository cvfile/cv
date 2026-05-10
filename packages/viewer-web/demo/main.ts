import { CvEmbed } from '../src/index.js';

const ensureCustomElement = (): void => {
  if (!customElements.get('cv-embed')) {
    customElements.define('cv-embed', CvEmbed);
  }
};
ensureCustomElement();

const drop = document.getElementById('drop')!;
const fileInput = document.getElementById('file') as HTMLInputElement;
const pickBtn = document.getElementById('pick')!;
const mount = document.getElementById('viewer-mount')!;
const embed = document.getElementById('embed') as CvEmbed;

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) {
    void loadFile(f);
  }
});

drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files?.[0];
  if (f) {
    void loadFile(f);
  }
});

async function loadFile(file: File): Promise<void> {
  const buf = new Uint8Array(await file.arrayBuffer());
  mount.hidden = false;
  await embed.loadFromBytes(buf);
}

const sampleLink = document.getElementById('load-sample');
sampleLink?.addEventListener('click', async (e) => {
  e.preventDefault();
  const res = await fetch('./sample.cv');
  const buf = new Uint8Array(await res.arrayBuffer());
  mount.hidden = false;
  await embed.loadFromBytes(buf);
});
