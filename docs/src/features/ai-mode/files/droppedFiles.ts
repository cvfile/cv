// The file the visitor dropped in this tab, shared by the page's own script, which fills it, and the AI
// mode's page tools, which read it. It never leaves the browser: the tools read it in the page and the
// server sees none of it. `droppedCv` is the file opened on /view/, `droppedPdf` the PDF given to /create/.

export interface DroppedFile {
  name: string;
  bytes: Uint8Array;
}

type Listener = (file: DroppedFile | null) => void;

export interface FileSlot {
  get: () => DroppedFile | null;
  set: (file: DroppedFile) => void;
  subscribe: (listener: Listener) => () => void;
}

function createFileSlot(): FileSlot {
  let current: DroppedFile | null = null;
  const listeners = new Set<Listener>();
  return {
    get: () => current,
    set: (file) => {
      current = file;
      listeners.forEach((listener) => listener(file));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const droppedCv = createFileSlot();
export const droppedPdf = createFileSlot();
