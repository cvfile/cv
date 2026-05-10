import { LitElement, css, html, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { extract } from '@cvfile/sdk';
import type { CvFile } from '@cvfile/sdk';
import { renderMarkdown } from './render-markdown.js';
import { renderPdfPage } from './render-pdf.js';

type Tab = 'pdf' | 'md' | 'html';
type Theme = 'auto' | 'light' | 'dark';
type ChangedKeys = Map<PropertyKey, unknown>;

export class CvEmbed extends LitElement {
  static override styles = css`
    :host {
      --cv-color: #111;
      --cv-bg: #fafaf9;
      --cv-border: #e5e5e3;
      --cv-toolbar-bg: #ffffff;
      --cv-stage-bg: #f4f4f2;
      --cv-meta: #6b7280;
      --cv-tab-hover: rgba(0, 0, 0, 0.04);
      --cv-tab-active: rgba(0, 0, 0, 0.08);
      --cv-card-bg: #ffffff;
      --cv-card-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
      --cv-focus-ring: #4f46e5;
      --cv-error: #b91c1c;
      --cv-error-bg: #fef2f2;

      display: block;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: var(--cv-color);
      background: var(--cv-bg);
      border: 1px solid var(--cv-border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      width: 100%;
      min-height: 480px;
      contain: paint;
    }

    :host([theme='dark']),
    :host([theme='auto']) {
      color-scheme: light dark;
    }
    :host([theme='dark']) {
      --cv-color: #f3f4f6;
      --cv-bg: #0b0b0d;
      --cv-border: #2a2a2e;
      --cv-toolbar-bg: #15151a;
      --cv-stage-bg: #0f0f12;
      --cv-meta: #9ca3af;
      --cv-tab-hover: rgba(255, 255, 255, 0.05);
      --cv-tab-active: rgba(255, 255, 255, 0.10);
      --cv-card-bg: #15151a;
      --cv-card-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
      --cv-error-bg: #2a1414;
    }
    @media (prefers-color-scheme: dark) {
      :host([theme='auto']) {
        --cv-color: #f3f4f6;
        --cv-bg: #0b0b0d;
        --cv-border: #2a2a2e;
        --cv-toolbar-bg: #15151a;
        --cv-stage-bg: #0f0f12;
        --cv-meta: #9ca3af;
        --cv-tab-hover: rgba(255, 255, 255, 0.05);
        --cv-tab-active: rgba(255, 255, 255, 0.10);
        --cv-card-bg: #15151a;
        --cv-card-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
        --cv-error-bg: #2a1414;
      }
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--cv-border);
      background: var(--cv-toolbar-bg);
      flex-wrap: wrap;
    }
    .tab {
      appearance: none;
      border: 0;
      background: transparent;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      font: inherit;
      color: inherit;
      cursor: pointer;
      opacity: 0.6;
      transition: background 120ms, opacity 120ms;
    }
    .tab:hover:not([disabled]) { background: var(--cv-tab-hover); opacity: 0.95; }
    .tab[aria-selected='true'] {
      background: var(--cv-tab-active);
      opacity: 1;
      font-weight: 600;
    }
    .tab[disabled] { opacity: 0.3; cursor: not-allowed; }
    .tab:focus-visible {
      outline: 2px solid var(--cv-focus-ring);
      outline-offset: 2px;
    }
    .meta {
      margin-left: auto;
      font-size: 0.8rem;
      color: var(--cv-meta);
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .meta code { font: inherit; opacity: 0.85; }
    .stage {
      position: relative;
      min-height: 420px;
      max-height: var(--cv-max-height, 80vh);
      overflow: auto;
      padding: 0;
      background: var(--cv-stage-bg);
    }
    .pdf-canvas {
      display: block;
      margin: 1rem auto;
      box-shadow: var(--cv-card-shadow);
      background: #fff;
      max-width: 100%;
    }
    .pager {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: var(--cv-toolbar-bg);
      border-top: 1px solid var(--cv-border);
      font-size: 0.85rem;
    }
    .pager button {
      appearance: none;
      border: 1px solid var(--cv-border);
      background: var(--cv-card-bg);
      color: inherit;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
    }
    .pager button:focus-visible {
      outline: 2px solid var(--cv-focus-ring);
      outline-offset: 2px;
    }
    .pager button[disabled] { opacity: 0.4; cursor: not-allowed; }
    .md, .html {
      padding: 1.5rem 2rem;
      background: var(--cv-card-bg);
      max-width: 760px;
      margin: 1rem auto;
      box-shadow: var(--cv-card-shadow);
      border-radius: 8px;
      line-height: 1.6;
    }
    .html iframe {
      width: 100%;
      min-height: 420px;
      border: 0;
      background: #fff;
      border-radius: 4px;
    }
    .md :first-child { margin-top: 0; }
    .md h1 { font-size: 1.75rem; }
    .md h2 { font-size: 1.25rem; border-bottom: 1px solid var(--cv-border); padding-bottom: 0.25rem; margin-top: 1.5rem; }
    .md ul { padding-left: 1.25rem; }
    .md a { color: var(--cv-focus-ring); }

    .skeleton {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.5rem 2rem;
      max-width: 760px;
      margin: 1rem auto;
    }
    .skeleton .bar {
      height: 1rem;
      background: linear-gradient(90deg, var(--cv-tab-hover) 0%, var(--cv-tab-active) 50%, var(--cv-tab-hover) 100%);
      background-size: 200% 100%;
      border-radius: 4px;
      animation: shimmer 1.4s infinite;
    }
    .skeleton .bar.short { width: 40%; }
    .skeleton .bar.medium { width: 70%; }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--cv-meta);
    }

    .err {
      margin: 1rem;
      padding: 1.5rem;
      background: var(--cv-error-bg);
      color: var(--cv-error);
      border-radius: 8px;
      border: 1px solid var(--cv-error);
    }
    .err button {
      margin-top: 0.75rem;
      appearance: none;
      border: 1px solid var(--cv-error);
      background: transparent;
      color: var(--cv-error);
      padding: 0.4rem 0.9rem;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
    }

    /* Compact mode for narrow viewports */
    @media (max-width: 480px) {
      .toolbar { padding: 0.4rem 0.5rem; }
      .tab { padding: 0.35rem 0.6rem; font-size: 0.9rem; }
      .meta { width: 100%; margin-left: 0; padding-top: 0.25rem; font-size: 0.75rem; }
      .md, .html { padding: 1rem 1.25rem; margin: 0.5rem; }
    }

    /* Honour user motion preferences. */
    @media (prefers-reduced-motion: reduce) {
      .skeleton .bar { animation: none; }
      .tab { transition: none; }
    }
  `;

  @property({ type: String }) src = '';
  @property({ type: String }) view: Tab | 'auto' = 'auto';
  @property({ type: String, attribute: 'language' }) language = '';
  @property({ type: Boolean, attribute: 'tab-bar' }) tabBar = true;
  @property({ type: String, reflect: true }) theme: Theme = 'auto';

  @state() private file: CvFile | null = null;
  @state() private error: string | null = null;
  @state() private activeTab: Tab = 'pdf';
  @state() private loading = true;
  @state() private pdfPage = 1;
  @state() private pdfPageCount = 1;

  private pdfModulePromise: Promise<typeof import('./render-pdf.js')> | null = null;

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();
    if (this.src) {
      await this.loadFromSrc();
    }
  }

  override willUpdate(changed: ChangedKeys): void {
    if (changed.has('src') && this.src) {
      void this.loadFromSrc();
    }
    if (changed.has('view') && this.view !== 'auto' && this.file) {
      this.activeTab = this.view;
    }
  }

  override updated(changed: ChangedKeys): void {
    if (changed.has('activeTab') || changed.has('file') || changed.has('pdfPage')) {
      if (this.activeTab === 'pdf' && this.file) {
        void this.renderPdf();
      }
    }
  }

  loadFromBytes(bytes: Uint8Array): Promise<void> {
    return this.processBytes(bytes);
  }

  /** Public API: re-attempt the last load (used by error retry button). */
  async retry(): Promise<void> {
    this.error = null;
    if (this.src) {
      await this.loadFromSrc();
    }
  }

  private async loadFromSrc(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.file = null;
    try {
      const res = await fetch(this.src);
      if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      await this.processBytes(buf);
    } catch (err) {
      this.error = (err as Error).message;
      this.loading = false;
    }
  }

  private async processBytes(bytes: Uint8Array): Promise<void> {
    this.loading = true;
    try {
      const file = await extract(bytes);
      this.file = file;
      this.activeTab = this.pickInitialTab(file);
      this.loading = false;
    } catch (err) {
      this.error = (err as Error).message;
      this.loading = false;
    }
  }

  private pickInitialTab(file: CvFile): Tab {
    if (this.view !== 'auto') return this.view;
    void file;
    return 'pdf';
  }

  private async renderPdf(): Promise<void> {
    if (!this.file) return;
    const canvas = this.renderRoot.querySelector<HTMLCanvasElement>('.pdf-canvas');
    if (!canvas) return;
    if (!this.pdfModulePromise) {
      this.pdfModulePromise = import('./render-pdf.js');
    }
    try {
      const mod = await this.pdfModulePromise;
      const { numPages } = await mod.renderPdfPage(this.file.bytes, this.pdfPage, canvas);
      if (numPages !== this.pdfPageCount) {
        this.pdfPageCount = numPages;
      }
    } catch (err) {
      this.error = `PDF render failed: ${(err as Error).message}`;
    }
  }

  private switchTab(tab: Tab, available: Record<Tab, boolean>): void {
    if (!available[tab]) return;
    this.activeTab = tab;
  }

  /** Keyboard navigation per WAI-ARIA tablist authoring practices. */
  private handleTabKeydown(event: KeyboardEvent, available: Record<Tab, boolean>): void {
    const order: Tab[] = (['pdf', 'md', 'html'] as Tab[]).filter((t) => available[t]);
    const idx = order.indexOf(this.activeTab);
    let next: Tab | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = order[(idx + 1) % order.length] ?? null;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = order[(idx - 1 + order.length) % order.length] ?? null;
        break;
      case 'Home':
        next = order[0] ?? null;
        break;
      case 'End':
        next = order[order.length - 1] ?? null;
        break;
    }
    if (next) {
      event.preventDefault();
      this.switchTab(next, available);
      requestAnimationFrame(() => {
        const button = this.renderRoot.querySelector<HTMLButtonElement>(`button[data-tab="${next}"]`);
        button?.focus();
      });
    }
  }

  override render(): TemplateResult {
    if (this.error) {
      return html`<div class="err" role="alert">
        <strong>Could not load .cv</strong>
        <div>${this.error}</div>
        ${this.src
          ? html`<button type="button" @click=${() => void this.retry()}>Retry</button>`
          : null}
        <slot name="error"></slot>
      </div>`;
    }
    if (this.loading || !this.file) {
      return html`<div class="empty" aria-busy="true" aria-live="polite">
        <div class="skeleton" part="skeleton">
          <div class="bar short"></div>
          <div class="bar"></div>
          <div class="bar medium"></div>
          <div class="bar"></div>
          <div class="bar short"></div>
        </div>
      </div>`;
    }

    const file = this.file;
    const md = file.payloads.find((p) => p.mimeType === 'text/markdown');
    const htmlPayload = file.payloads.find((p) => p.mimeType === 'text/html');
    const available: Record<Tab, boolean> = {
      pdf: true,
      md: !!md,
      html: !!htmlPayload,
    };
    const panelId = 'cv-embed-panel';

    return html`
      ${this.tabBar
        ? html`<div
            class="toolbar"
            role="tablist"
            aria-label="Document representations"
            part="toolbar"
            @keydown=${(e: KeyboardEvent) => this.handleTabKeydown(e, available)}
          >
            ${(['pdf', 'md', 'html'] as Tab[]).map((t) => {
              const enabled = available[t];
              const selected = this.activeTab === t;
              const labels: Record<Tab, string> = { pdf: 'PDF', md: 'Markdown', html: 'HTML' };
              return html`<button
                class="tab"
                data-tab=${t}
                role="tab"
                part="tab tab-${t}${selected ? ' tab-active' : ''}"
                aria-selected=${selected}
                aria-controls=${panelId}
                tabindex=${selected ? 0 : -1}
                ?disabled=${!enabled}
                @click=${() => this.switchTab(t, available)}
              >
                ${labels[t]}
              </button>`;
            })}
            <div class="meta" part="meta">
              <span><code>cv:${file.metadata.version}</code></span>
              <span>${file.metadata.primaryLanguage}</span>
              <span>${file.payloads.length} payload${file.payloads.length === 1 ? '' : 's'}</span>
            </div>
          </div>`
        : null}
      <div
        id=${panelId}
        class="stage"
        role="tabpanel"
        part="stage"
        aria-label="${this.activeTab.toUpperCase()} representation"
      >
        ${this.activeTab === 'pdf'
          ? html`<canvas class="pdf-canvas" part="pdf-canvas" aria-label="PDF preview"></canvas>`
          : this.activeTab === 'md' && md
            ? html`<div class="md" part="md">${this.renderMd(md.text())}</div>`
            : this.activeTab === 'html' && htmlPayload
              ? html`<div class="html" part="html">
                  <iframe sandbox="" srcdoc=${htmlPayload.text()} title="HTML rendering"></iframe>
                </div>`
              : html`<div class="empty">No payload available for this view.</div>`}
      </div>
      ${this.activeTab === 'pdf' && this.pdfPageCount > 1
        ? html`<div class="pager" part="pager">
            <button
              type="button"
              ?disabled=${this.pdfPage <= 1}
              aria-label="Previous page"
              @click=${() => {
                this.pdfPage = Math.max(1, this.pdfPage - 1);
              }}
            >
              ← Prev
            </button>
            <span aria-live="polite">Page ${this.pdfPage} of ${this.pdfPageCount}</span>
            <button
              type="button"
              ?disabled=${this.pdfPage >= this.pdfPageCount}
              aria-label="Next page"
              @click=${() => {
                this.pdfPage = Math.min(this.pdfPageCount, this.pdfPage + 1);
              }}
            >
              Next →
            </button>
          </div>`
        : null}
    `;
  }

  private renderMd(source: string): TemplateResult {
    const safeHtml = renderMarkdown(source);
    const tmpl = document.createElement('template');
    tmpl.innerHTML = safeHtml;
    return html`${tmpl.content.cloneNode(true)}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'cv-embed': CvEmbed;
  }
}

export { renderPdfPage };
