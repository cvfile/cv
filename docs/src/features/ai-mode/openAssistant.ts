// Lets a button of the page's own script open the assistant panel of the header island, such as the "Ask
// about this file" button of /view/.

type Listener = () => void;

const listeners = new Set<Listener>();

export function openAssistant() {
  listeners.forEach((listener) => listener());
}

export function onOpenAssistant(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
