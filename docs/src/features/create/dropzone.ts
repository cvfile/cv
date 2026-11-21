// A drop zone of the builder: a file dropped on it or chosen with its hidden picker.

export function bindDropzone(zone: HTMLElement, picker: HTMLInputElement, onFile: (file: File) => void): void {
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    if (file) {
      onFile(file);
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
      onFile(file);
    }
  });
}

// Saves the packed file. A Blob takes views on an ArrayBuffer, so it gets a copy of the bytes.
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/vnd.cv+pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
