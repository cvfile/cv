# `.cv` — one file, three audiences, real semantic search

`.cv` is an open file format that bundles a designed PDF, a clean Markdown copy, a self-contained HTML rendering, and (optionally) pre-computed BGE-M3 embeddings of the same document into a single PDF/A-3u file. Double-clicking it opens in any PDF viewer (Preview, Adobe Reader, Chrome) on day one. No installer required for the visual fallback. Bots that ask for `text/markdown` get the markdown back. RAG pipelines that recognize the format read the embedded vectors directly instead of re-embedding.

Spec is stable at **`cv-1.0`** (`spec/cv-1.0.md`).

## Quick start

```bash
# CLI (single Go binary)
brew tap cvfile/tap && brew install cv

# JavaScript / TypeScript
pnpm add @cvfile/sdk

# Python
pip install cvfile

# Go
go get github.com/cvfile/cv/sdks/go

# Web component
<script type="module" src="https://cdn.cvfile.org/embed/1/cv-embed.js"></script>
<cv-embed src="resume.cv" view="auto" theme="auto"></cv-embed>
```

```ts
import { pack, extractMarkdown } from '@cvfile/sdk';

const cvBytes = await pack({
  pdf: await readFile('resume.pdf'),
  markdown: await readFile('resume.md', 'utf8'),
  metadata: { primaryLanguage: 'en', primaryPayload: 'resume.md' },
});

const md = await extractMarkdown(cvBytes);
```

## What's in this monorepo

| Path | What it ships |
| --- | --- |
| `spec/` | Normative `.cv-1.0` spec (CC-BY-4.0) + IANA registration template |
| `spec/test-vectors/malicious/` | 7 mutated fixtures the validator must reject |
| `packages/sdk-js/` | `@cvfile/sdk` — pack / extract / inspect / validate (browser + Node) |
| `packages/embed-js/` | `@cvfile/embed` — chunker + transformers.js + HF Inference backends |
| `packages/server-middleware-node/` | `@cvfile/server` — Express/Fastify/Hono + vanilla http |
| `packages/viewer-web/` | `@cvfile/viewer-web` — `<cv-embed>` Lit component |
| `sdks/python/` | `cvfile` (PyPI) — full SDK + `cvfile.embed` + `cvfile.server` (ASGI/WSGI) + LangChain/LlamaIndex loaders |
| `sdks/go/` | `cv-go` library, `cv` CLI binary, `cv-go/middleware` net/http handler |
| `docs/` | cvfile.org Astro site |
| `tools/verapdf-runner/` | Docker wrapper for PDF/A-3u conformance gate |
| `tools/installer-payloads/` | macOS UTI plist, Windows `.reg`, Linux `.desktop` + shared-mime-info |
| `tools/release-binaries/` | GoReleaser + WinGet manifests + per-release runbook |

## Status

- ✅ Spec stable at `1.0`. IANA registration template prepared.
- ✅ Three reference SDKs (JS, Python, Go) with cross-language byte-identical interop.
- ✅ veraPDF PASS for `cv-strict` output from JS and Python SDKs.
- ✅ 7-fixture malicious corpus, identical error codes across all three SDK validators.
- ✅ Real BGE-M3 round trip end-to-end via Hugging Face Inference (no local model download).
- ✅ `cv search` CLI produces semantic-search results from the embedded vectors.
- ✅ Three HTTP middleware implementations (Node, Python ASGI/WSGI, Go) with byte-identical content negotiation.
- ✅ `<cv-embed>` viewer with ARIA tabs, keyboard nav, dark/light theming, mobile layout.
- ✅ LangChain `CvFileLoader` and LlamaIndex `CvFileReader`.
- ✅ Astro docs site builds 5 pages including a live drag-drop viewer demo.
- ✅ GoReleaser config + Homebrew/Scoop/WinGet templates.

**129 tests passing across 7 packages and 3 languages.**

## Documents

| File | Purpose |
| --- | --- |
| [`spec/cv-1.0.md`](./spec/cv-1.0.md) | Normative format specification (stable) |
| [`spec/iana-registration-application-vnd-cv+pdf.txt`](./spec/iana-registration-application-vnd-cv+pdf.txt) | IANA media-type registration template |
| [`PLAN.md`](./PLAN.md) | Architectural plan: container choice, business model, security model, phasing |
| [`ROADMAP.md`](./ROADMAP.md) | Sequenced phases, technical + business actions, gates, risks |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to contribute |
| [`SECURITY.md`](./SECURITY.md) | Threat model and disclosure policy |
| [`CHANGELOG.md`](./CHANGELOG.md) | What changed when |

## License

Code: **Apache-2.0**. Spec: **CC-BY-4.0**.
