// The Markdown editor of /create/ as the AI draft writes to it: the draft goes in the Paste tab's textarea
// and the language in the metadata field, where the visitor reviews them before clicking Build.

export const MARKDOWN_FIELD_ID = 'md-text';
const LANGUAGE_FIELD_ID = 'lang';

function field<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`The builder has no #${id}`);
  }
  return element as T;
}

export function showPasteTab() {
  document.querySelector<HTMLButtonElement>('.tab[data-tab="paste"]')?.click();
}

export function writeDraft(markdown: string, language: string) {
  showPasteTab();
  const editor = field<HTMLTextAreaElement>(MARKDOWN_FIELD_ID);
  editor.value = markdown;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  field<HTMLInputElement>(LANGUAGE_FIELD_ID).value = language;
}
