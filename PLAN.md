# `.cv` — A New Open File Format

## Context

We are creating a new open standard, `.cv`, for documents (initially CVs, but the format is content-agnostic). A single `.cv` file carries three coordinated representations of the same content plus a machine-learning ready vector index:

- **PDF** — what humans see when they double-click. Pixel-faithful, designed.
- **Markdown** — what bots, ATS systems, and LLMs read. Clean, semantic, language-portable.
- **HTML** — what web pages embed. Self-contained, themable.
- **Embeddings** — pre-computed open-source vector representation of the markdown so RAG/LLM pipelines can semantically index a `.cv` without re-embedding.

**Why this matters.** Today a person sends three different artifacts to three different audiences (a polished PDF to recruiters, a markdown copy to ATS, a web bio for their site) and they drift out of sync within weeks. Bots that scrape PDFs do it with brittle OCR. AI tools re-embed the same documents over and over. `.cv` fixes all three: one file, one source of truth, opens everywhere on day one.

**Architectural decisions already made (from user input):**
1. Container is **PDF-primary**: a `.cv` file is a valid PDF/A-3u with `.md`, `.html`, and `embeddings.cbor` carried as PDF Associated Files (`/AF`). Clicking it opens in any PDF reader on day one — zero install required for the visual fallback.
2. Scope is the **full ecosystem from day one**: spec, CLI, JS/Python/Go SDKs, web viewer + `<cv-embed>` web component, native desktop viewers (macOS/Windows/Linux) with `.cv` file association, and server middleware for content negotiation.
3. Bot/LLM discovery uses **HTTP `Link` headers + content negotiation**. Servers serving a `.cv` advertise alternates and respond to `Accept: text/markdown` or `?format=md` by extracting the inner payload.
4. Embeddings use a **pluggable open-source model with a recommended default** (BAAI BGE-M3, MIT license, multilingual, 1024-dim). The spec stores the model identifier and revision so consumers can tell what they are comparing.

---

## Repository layout (pnpm + Turborepo monorepo)

Layout as actually shipped today. Items in *italics* are planned but not yet built.

```
/Users/ilan/Projects/cv/
├── package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json
├── LICENSE (Apache-2.0 for code; spec is CC-BY-4.0)
├── README.md, PLAN.md, ROADMAP.md, CONTRIBUTING.md, SECURITY.md, CHANGELOG.md
├── .github/workflows/   ci, deploy-docs, publish-{npm,pypi,langchain,llama-index,haystack,cv-detector-{pypi,npm}}, release-cv-cli
│
├── spec/
│   ├── cv-1.0.md                  the normative spec (RFC 2119 keywords)
│   ├── iana-registration-application-vnd-cv+pdf.txt   submitted to media-types@iana.org 2026-05-16
│   └── test-vectors/              canonical fixtures, including malicious corpus
│
├── packages/                      JS/TS workspace
│   ├── sdk-js/                    @cvfile/sdk
│   ├── embed-js/                  @cvfile/embed (BGE-M3 via HF Inference + transformers.js)
│   ├── server-middleware-node/    @cvfile/server (Express/Fastify/Hono)
│   └── viewer-web/                @cvfile/viewer-web — <cv-embed> + cvfile.org/view
│   # planned: viewer-desktop (Tauri 2), viewer-core (extracted UI logic), cli (npm wrapper)
│
├── sdks/
│   ├── python/                    cvfile on PyPI (uv + hatchling); ASGI + WSGI middleware
│   └── go/                        github.com/cvfile/cv/sdks/go
│       ├── cv/                    library
│       ├── cmd/cv/                canonical `cv` CLI binary (GoReleaser → 6 targets)
│       ├── middleware/            net/http + chi adapters
│       └── embed/                 embedding subpackage
│
├── integrations/
│   ├── langchain-cvfile/          LangChain document loader (PyPI)
│   ├── llama-index-readers-cvfile/   LlamaIndex reader (PyPI)
│   └── cvfile-haystack/           Haystack 2.x converter (PyPI)
│
├── interop/                       cross-SDK round-trip matrix (3 producers × 3 consumers)
│
├── docs/                          cvfile.org (Astro): index, spec, view, tutorial, ecosystem
│
└── tools/
    ├── verapdf-runner/            Docker wrapper for PDF/A-3u conformance gate
    ├── release-binaries/          GoReleaser config + Homebrew, Scoop, WinGet manifests
    ├── installer-payloads/        macOS UTI plist, Windows .reg, Linux .desktop + MIME XML
    └── cv-detector/               cvfile-cv-detector reference sniffer (Python, Go, TypeScript)
```

**Boundary rationale:**
- `packages/` = everything published to npm; shares pnpm + Turbo cache.
- `sdks/python` and `sdks/go` are siblings (their toolchains do not compose with Turbo) and have their own CI jobs.
- `integrations/` is sibling to `packages/` and `sdks/` because each integration's release cadence and dependency footprint differs from the core SDKs and from one another.
- The CLI is a Go binary at `sdks/go/cmd/cv` so users get `brew install cvfile/tap/cv` with no Node/Python prerequisite.
- `spec/test-vectors/` is the source of truth every SDK test suite consumes — prevents drift.
- `viewer-core` (planned) would extract the framework agnostic UI state out of `viewer-web` once the Tauri desktop app starts; today the web viewer carries that logic itself.

---

## The spec (`spec/cv-1.0.md`)

Section outline (RFC 2119 keywords throughout):

1. Introduction, goals, conformance levels (`cv-strict`, `cv-lenient`).
2. Terminology.
3. Container — MUST be a valid PDF 1.7 or 2.0 file conformant to **PDF/A-3u** (ISO 19005-3, Unicode level). MUST NOT contain JavaScript actions, `/Launch`, `/SubmitForm` to non-mailto URIs, or encryption.
4. Embedded payloads (`/AF` entries):
   - 4.1 `AFRelationship` MUST be `/Alternative` for content payloads, `/Data` for embeddings, `/Supplement` for attachments.
   - 4.2 At least one of `resume.md` (recommended primary) or `resume.html` is REQUIRED.
   - 4.3 Optional: `resume.html`, `resume.json` (JSON Resume v1.0.0), `embeddings.cbor`, `attachments/*`.
   - 4.4 **Embeddings payload** (new, see embeddings section below).
   - 4.5 Filenames POSIX-portable, lowercase. Each `/Filespec` MUST set `/UF` and `/Desc`.
5. Metadata (XMP):
   - Namespace: `http://ns.cvfile.org/cv/1.0/`, prefix `cv`.
   - Required: `cv:version`, `cv:created`, `cv:primaryLanguage` (BCP-47), `cv:primaryPayload`.
   - Recommended: `cv:modified`, `cv:alternates`, `cv:integrity` (SHA-256 over unwrapped payload bytes), `cv:generator`, `cv:embeddings` (model + dimension + metric, greppable without parsing binary).
6. Ordering (informative): producers SHOULD order `/AF` as primary, alternates by language, embeddings, supplements.
7. Security model (see Security section below).
8. Versioning: `MAJOR.MINOR`. Same MAJOR → consumers MUST ignore unknowns and continue rendering. Different MAJOR → render the PDF, surface a "newer format" warning.
9. Conformance: `cv-strict` (passes veraPDF PDF/A-3u + all MUSTs) vs `cv-lenient` (PDF + cv XMP + at least one valid payload).
10. IANA considerations: registers `application/vnd.cv+pdf`.
11. References, examples, change log.

**Key normative decisions:**
- **PDF/A-3u** (Unicode level), not 3a (too strict for handwritten CVs) or 3b (no Unicode guarantee).
- Markdown is the **recommended primary payload**, not HTML — markdown round-trips through LLMs and ATS reliably.
- Integrity digests RECOMMENDED, not REQUIRED; verified-when-present (right ratchet).
- No encryption in v1; revisit in v1.1.
- Unknown things ignored within same major version (only sane forward-compat rule).

---

## Embeddings payload (the addition that makes `.cv` AI-native)

**Goal:** when a `.cv` file enters a RAG pipeline, the LLM tool reads pre-computed vectors directly instead of re-embedding the markdown. Standardized so different consumers can compare apples-to-apples.

**Storage:**
- File: `embeddings.cbor` embedded as `/AF` with `AFRelationship=/Data`, MIME `application/vnd.cv.embeddings+cbor`.
- CBOR (not JSON) for compactness: ~4KB per 1024-dim vector vs ~13KB JSON.
- Schema:
  ```
  {
    model:          "BAAI/bge-m3",       // HuggingFace identifier
    modelRevision:  "<commit-sha>",      // pin for reproducibility
    dimension:      1024,
    metric:         "cosine",            // "cosine" | "dot" | "euclidean"
    normalized:     true,
    chunking:       "section",           // "document" | "section" | "paragraph"
    chunks: [
      { id: "header",     textOffset: 0,    textLength: 312,  vector: <bytes> },
      { id: "experience", textOffset: 312,  textLength: 4821, vector: <bytes> },
      ...
    ]
  }
  ```
- Per-section chunking by default so semantic search can match subsections.
- `textOffset`/`textLength` index into `resume.md` so a consumer can map a vector hit back to source text without re-tokenizing.

**Multiple embedding spaces are first-class.** `cv:embeddings` is a `Bag` — a producer MAY ship vectors in several spaces. Concrete model:
- **Default in `cv pack`:** BGE-M3 only (MIT, free, multilingual, no vendor calls).
- **Opt-in via `cv pack --embed-with bge-m3,openai-3-large,voyage-3,gemini-text-004`:** producer pays the vendor API cost at pack time; `.cv` carries one chunk array per model. Adds ~40–80KB per extra model.
- Each entry in the embeddings file declares its own `model` + `modelRevision` + `dimension` + `metric`, so consumers pick the space they actually use.

**What multi-space embeddings buy — and what they do NOT buy.** This is the part producers most commonly misread:
- Embeddings are never *input* to an LLM. They are a retrieval layer that returns text chunks; the LLM consumes the chunks.
- **None of ChatGPT, Claude, or Gemini expose a public API surface for "use these pre-computed vectors."** OpenAI's `file_search` tool, Anthropic's Files API, and Google's Vertex AI Search all re-embed any uploaded document with their own internal pipeline. Pre-shipped vectors are dead weight in that path.
- ChatGPT browsing / `GPTBot` / `ClaudeBot` / Gemini direct don't use embeddings at all — they read text into context.
- **Where same-space embeddings DO pay off:** third-party developers building RAG *on top of* those APIs, who embed candidates' `.cv` files into their own vector DB (Pinecone, Weaviate, Qdrant) and run similarity search themselves. For them, shipping `text-embedding-3-large` vectors saves the OpenAI embedding API call entirely (cost + latency + rate limits). Same logic for Voyage in Anthropic-app shops and Gemini-text-004 in Vertex shops.
- **Free baseline (BGE-M3) is for** open-source/self-hosted RAG (LangChain, LlamaIndex, Haystack), ATS first-pass matching across millions of CVs, and cross-`.cv` similarity at the same model. Even when a downstream tool re-embeds into another space, the pre-computed `textOffset`/`textLength` chunk boundaries save the segmentation work.

**Trade-offs documented in the spec when proprietary spaces are added:**
- Vendor lock-in + model deprecation (OpenAI retired `text-embedding-ada-002` in 2024; files embedded into a dead space go stale).
- File size inflation (cap recommended at 4 spaces).
- TOS awareness: OpenAI/Voyage/Google don't claim ownership of embedding outputs, but producers redistributing paid-API outputs publicly should read each vendor's terms.

**The path to ChatGPT/Claude/Gemini natively understanding `.cv` is NOT via embeddings.** It is via vendor integration to special-case `application/vnd.cv+pdf` and unwrap the `/AF` markdown payload during their own ingestion (Phase 5 outreach). Until that lands, server-side content negotiation (Phase 3) is the realistic delivery path — anyone who asks for `text/markdown` gets it, regardless of whether they recognize `.cv`.



**XMP mirror** (`cv:embeddings` property, greppable without parsing binary):
```
cv:embeddings rdf:Bag {
  rdf:li { cv:model="BAAI/bge-m3", cv:dimension=1024, cv:metric="cosine", cv:chunks=14 }
}
```
Multiple entries permitted — a producer MAY ship two models (e.g., a multilingual baseline plus a domain-specific one). Consumers pick the one they trust.

**Recommended default model: BAAI BGE-M3** (MIT, multilingual 100+ languages, 8K context, 1024-dim, top-tier MTEB scores). Alternatives explicitly allowed and documented:
- `nomic-ai/nomic-embed-text-v1.5` (Apache-2.0, 768-dim, Matryoshka)
- `Snowflake/snowflake-arctic-embed-l-v2.0` (Apache-2.0, multilingual)
- `mixedbread-ai/mxbai-embed-large-v1` (Apache-2.0, English-focused, 1024-dim)

**SDK API additions:**
- JS: `extractEmbeddings(buffer)`, `searchSemantic(buffer, query, { k })`, optional embedding generation in `@cvfile/embed` (transformers.js + ONNX, runs in browser and Node).
- Python: `cvfile.extract_embeddings()`, `cvfile.search_semantic()`, optional generation in `cvfile[embed]` extra (sentence-transformers).
- Go: `cv.ExtractEmbeddings()`, `cv.SearchSemantic()`, optional generation in `cv-go/embed` (shell-out to a small Go ONNX runtime, or to a sidecar Python process).
- CLI: `cv pack --embed-with bge-m3` (downloads model first run, caches in `~/.cache/cv/models/`), `cv search file.cv "founding engineer python"`.

Generators are in **optional packages** so the core SDK stays small (no 500MB model weights as transitive deps). A producer who only wants pack/extract pays nothing for the embedding feature.

---

## CLI design

**Single Go binary**, `cv`, built from `sdks/go/cmd/cv`. Justification: pdfcpu is the most production-ready PDF library outside JS, GoReleaser cross-compiles to six targets trivially, and we already need a Go SDK — so one codebase produces both the library and the CLI.

```
cv pack    --pdf <p> --md <p> [--html <p>] [--json <p>] [--lang <bcp47>]
           [--primary <name>] [--attach <p>] [--embed-with <model>]
           [--metadata k=v] [--no-pdfa] [--integrity sha256|none] -o <out>

cv extract <file.cv> [--to <dir>] [--payload <name>] [--format md|html|pdf|embeddings]

cv inspect <file.cv> [--json]

cv validate <file.cv> [--strict|--lenient] [--report <p>]

cv search   <file.cv> "<query>" [--k 5] [--model <override>]

cv serve    <file.cv> [--port 7373]      # demonstrates Link-header content negotiation

cv version | cv help [command]
```

Exit codes (POSIX/sysexits): 0 success, 2 usage, 64 invalid input, 65 validation failure, 66 payload missing.

Distribution: GoReleaser → darwin-arm64/amd64, linux-arm64/amd64, windows-arm64/amd64. Channels: Homebrew tap (`cvfile/tap/cv`), Scoop (`cvfile/cv`), WinGet (`cvfile.cv`), `curl -fsSL https://cvfile.org/install.sh | sh`. Tiny `@cvfile/cli` npm package wraps a postinstall download for the JS-native crowd.

---

## JS SDK API (`@cvfile/sdk`)

Single package, dual entry (browser + Node), ESM + CJS, types included, built with tsup. pdf-lib under the hood (works in both runtimes — rare and precious).

Core exports:
```ts
pack(input: PackInput): Promise<Uint8Array>
extract(buffer): Promise<CvFile>
extractMarkdown(buffer, opts?: { language?: string }): Promise<string | null>
extractHtml(buffer, opts?: { language?: string }): Promise<string | null>
extractEmbeddings(buffer): Promise<EmbeddingsPayload | null>
inspect(buffer): Promise<CvMetadata>
validate(buffer, opts?: { strict?: boolean }): Promise<ValidationReport>
isCvFile(buffer): Promise<boolean>
```

`PackInput` accepts `pdf`, `markdown`, `html`, `json`, `payloads[]`, `embeddings?` (precomputed) or `embedWith?: { model, dimension }` (deferred to `@cvfile/embed`), `metadata`, `pdfa: boolean`. Browser/Node compatibility via `Uint8Array` lingua franca; no `fs` in the main module — file-path helpers live in `/node` subpath export.

Same surface, idiomatic naming, in:
- **Python `cvfile`** (PyPI): `pack()`, `extract()`, `extract_markdown()`, `extract_embeddings()`, `inspect()`, `validate()`. pypdf under the hood (with internal `_pdf.py` abstraction so we can swap to pikepdf if PDF/A-3 conformance demands it). uv + hatchling, Python 3.10+.
- **Go `github.com/cvfile/cv/sdks/go`**: `Pack()`, `Extract()`, `ExtractMarkdown()`, `ExtractEmbeddings()`, `Inspect()`, `Validate()`. pdfcpu under the hood, isolated behind an internal interface. Streaming readers throughout. Go 1.22+.

**Naming consistency:** `pack`/`extract`/`extractMarkdown`/`inspect`/`validate` everywhere — same words, idiomatic casing. No `unpack`, `read`, `parse`.

---

## Web viewer + `<cv-embed>`

Two-package split:
- `@cvfile/viewer-core` — framework-agnostic, exports a `ViewerModel` class owning state (current tab, language, payloads, errors). Pure TypeScript, no DOM dependencies in core logic.
- `@cvfile/viewer-web` — Lit-based `<cv-embed>` web component + the `cvfile.org/view` standalone demo.

**Why Lit:** smallest viable web-component framework (~5KB), no consumer build step, plays well with Tauri's webview.

Component API:
```html
<script type="module" src="https://cdn.cvfile.org/embed/1/cv-embed.js"></script>
<cv-embed src="resume.cv" view="auto" lang="en" theme="auto" controls="full">
  <a slot="fallback" href="resume.cv">Download CV</a>
</cv-embed>
```

Attributes: `src`, `view` (`pdf|md|html|auto`), `lang`, `theme`, `controls`, `tab-bar`, `height`, `width`. Slots: default (loading), `fallback` (404/error), `error`. **Lazy loading**: shell ~10KB sync; PDF.js worker (~600KB gz) only loads when user opens the PDF tab. Markdown rendered with `marked` + `DOMPurify`. HTML rendered in `<iframe sandbox>` with no `allow-scripts`.

`cvfile.org/view` is an Astro single-page app: drag-drop zone, paste-URL, sample gallery, "Copy embed code" button.

---

## Native desktop viewer

**Tauri 2** (Rust + system webview), not Electron. ~5–10MB binary vs ~80–150MB. Loads `viewer-web` build output as the UI — same code as the web component.

PDF parsing on the Rust side: ship the Go `cv` binary as a **Tauri sidecar** rather than re-implementing the spec in a third language. Sidecars are a documented Tauri pattern and we already cross-compile the binary.

File-association registration shipped via installer:
- **macOS** — `Info.plist` declares `CFBundleDocumentTypes` + `UTExportedTypeDeclarations` (UTI `org.cvfile.cv`, conforms to `com.adobe.pdf`).
- **Windows** — `.reg` setting `HKEY_CLASSES_ROOT\.cv → CVFile.Document → shell\open\command`.
- **Linux** — `cvfile.desktop` + `application-vnd.cv+pdf.xml` for `update-mime-database`; postinst runs `xdg-mime default ...`.

Viewer never sets itself as default unless the user opts in during onboarding — hijacking PDF defaults is a reputational risk we do not take.

---

## Server middleware contract

Given a request for a `.cv` resource:
1. Set `Link: <self>; rel="alternate"; type="application/vnd.cv+pdf", <self>?format=md; rel="alternate"; type="text/markdown", <self>?format=html; rel="alternate"; type="text/html"`.
2. If `?format=md|html|pdf` present, it wins. Otherwise parse `Accept` with q-values.
3. `text/markdown` → extract `resume.md` (use `Accept-Language` for alternate selection). `text/html` → extract `resume.html`, or render md → html if html absent (sanitized). Default → original PDF bytes.
4. Always set `Vary: Accept, Accept-Language`. ETag = sha256 of served bytes.

Adapters:
- **Node** `@cvfile/server` — Express, Fastify, Hono, plus a manual `cvHandler()` for any framework. Options: `root: string` (filesystem) or `loader: (path) => Promise<Uint8Array>` (object storage), `cacheExtractedPayloads: boolean` (default true, LRU 100), `defaultFormat`.
- **Python** `cvfile.server` — ASGI app for FastAPI/Starlette, plus sync WSGI for Flask/Django.
- **Go** `cv-go/middleware` — `net/http` handler + chi adapter.

The conneg algorithm is one shared spec; every adapter tests it identically.

---

## Bot/LLM consumption: what actually happens today

Critical to document up-front so we never over-promise. Today no LLM crawler (`GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Google-Extended`, `PerplexityBot`) recognizes `.cv` as a special format. If a `.cv` is served raw, they will run **standard PDF text extraction over the visual layer** and **ignore the `/AF` markdown payload**. They cannot consume the embedded BGE-M3 vectors at all (proprietary embedding spaces). Without our middleware, served-raw `.cv` gives bots a *worse* signal than if you had served plain markdown.

**The fix is the HTTP layer, not the file format.** The server middleware makes the wrapper invisible:

| Consumer's `Accept` | What we serve | What the consumer sees |
|---|---|---|
| `text/html, */*` (most LLM crawlers, browsers) | extracted `resume.html` | clean semantic HTML, no OCR loss |
| `text/markdown` (newer LLM agents, our own SDK) | extracted `resume.md` | cleanest possible signal |
| `application/pdf` or `application/vnd.cv+pdf` | original `.cv` bytes | the visual PDF (still valid) |
| absent / generic browser | original `.cv` bytes | renders in built-in PDF viewer |

The bot never needs to know `.cv` exists. Each consumer gets the representation that suits it best. **The format is producer-side convenience (one file to author, version, host); consumer-side it is invisible.** This is the design's strongest property.

**Path to native bot recognition** (post-1.0 ecosystem play):
1. Land IANA registration of `application/vnd.cv+pdf`.
2. Ship document-loader integrations to LangChain, LlamaIndex, Haystack — open source, fast PR cycles, immediate adoption inside the AI tooling ecosystem.
3. File integration requests with OpenAI (`file_search` tool), Anthropic (Files API + Citations), Google (Vertex AI Search), Perplexity, asking them to special-case `application/vnd.cv+pdf` and unwrap the `/AF` markdown payload before tokenization. Precedent exists for Office docs and ePub.
4. Until then, the `cv:version` XMP marker means a content sniffer can detect a `.cv` wrapper inside any file served as plain `application/pdf` and unwrap automatically. We ship a 200-line "cv detector" reference implementation so any crawler can adopt it without depending on our SDKs.

## MIME type & file association plan

- **Target:** `application/vnd.cv+pdf` (`+pdf` structured suffix; precedent: `application/vnd.adobe.formscentral.fcdt+pdf`).
- **IANA submission** under `cvfile.org` ownership (neutral org, not a personal name — the format must outlive any individual). Realistic timeline 2–6 weeks via media-types@iana.org.
- **Interim** (months 0–3): tooling emits `application/pdf`. Disambiguation lives in `cv:version` XMP marker + `.cv` extension. Link header advertises the target MIME from day one — clients that special-case it Just Work the moment IANA approves.
- **Linux distros**: file shared-mime-info MR after IANA approval.

---

## Security model (spec §7)

**Threat model:** untrusted `.cv` files received via email/web. Attacker goal: code execution, data exfiltration, or lateral movement when a recruiter or ATS opens the file.

| Attack surface | Mitigation |
|---|---|
| PDF JavaScript actions | Validator rejects; PDF.js JS off by default |
| `/Launch`, `/ImportData`, `/SubmitForm` | Validator rejects |
| External `/F` filespecs | Validator rejects |
| Encrypted streams | Rejected in v1 entirely |
| Markdown raw HTML, `javascript:` URIs | DOMPurify strict allowlist |
| Malicious HTML payload | `<iframe sandbox>` with no `allow-scripts allow-same-origin` |
| XXE in XMP | Vetted XMP parser, no DTD resolution |
| Zip-bomb-style oversized payloads | Configurable cap (default 16MB per payload) |
| Spoofed integrity digests | Validator recomputes; mismatch is hard fail |
| **Embedding poisoning** | `cv:embeddings` model + revision must match the actual chunks; SDK MAY recompute & compare |
| PDF parser CVEs | Pin pdf-lib/pypdf/pdfcpu, dependabot, `validate()` is the safe entry point before extraction |

`SECURITY.md` with `security@cvfile.org` and 90-day coordinated disclosure.

---

## Business model — open core with a paid hosted tier

The format and tooling are an open standard. Revenue comes from the operational layer most producers want help with.

**Free, forever, no account:**
- Spec (CC-BY-4.0), SDKs and CLI (Apache-2.0).
- BGE-M3 baseline embedding (no keys, no fees).
- Proprietary-space embeddings (`openai-3-large`, `voyage-3`, `gemini-text-004`) work fully when the user provides their own vendor API keys. The SDK calls vendors directly. We earn nothing on this path. **This is non-negotiable** — keeping the SDK fully capable without us is what keeps `.cv` from forking.

**Paid hosted tier at `cvfile.org/cloud`:**
- One `CVFILE_API_KEY` instead of three vendor accounts.
- One bill, one dashboard, observability, audit logs.
- Volume pricing better than vendor retail because we batch.
- SSO, retention controls, SLA at the Business tier.

**Pricing:**

| Tier | Audience | Price | Includes |
|---|---|---|---|
| Free / BYO keys | OSS, hobbyists, devs | $0 | Everything in the open SDK + CLI |
| Cloud | Solo / small team | vendor pass-through + 25% markup, monthly | Hosted embedding/normalization/validation, dashboard |
| Business | ATS vendors, recruiting platforms | $499/mo + usage | Above + SSO + audit + custom retention + SLA + self-hosted runner image |

Token math: a typical CV ≈ 3,000 markdown tokens. `text-embedding-3-large` retail $0.13/M → ~$0.0004/CV. With 25% markup → ~$0.0005. Three spaces packed → ~$0.0015/CV cloud-packed. The friction is convenience, not price.

**Hosted service architecture (`api.cvfile.org`):**
- Hono (or FastAPI) service. Endpoints: `POST /v1/embed`, `POST /v1/pack` (full hosted pack), `POST /v1/normalize` (PDF/A-3u via qpdf+gs), `POST /v1/validate`, `GET /v1/usage`.
- Vendor keys live in KMS-backed vault, never in app DB.
- Stripe metered billing. OpenTelemetry → hosted Grafana for observability.
- Auth via Clerk or Auth0; `cv_live_XXX` API keys with scoped permissions and per-key rate limits.

**SDK integration shape — applied from Phase 2 even though the cloud is Phase 6:**
```ts
embeddings: {
  provider: 'self' | 'cvfile-cloud',  // 'self' is default, calls vendors directly with user's keys
  models: ['bge-m3', 'openai-3-large', 'voyage-3', 'gemini-text-004'],
  apiKey?: string,                    // CVFILE_API_KEY when provider='cvfile-cloud'
}
```
Reserving the `provider` field early avoids a breaking API change when the cloud launches.

**Adjacent paid services (same open-core logic — SDK does it, cloud does it better):**
1. **PDF/A-3u normalization** — qpdf + Ghostscript pipeline. Heavy local deps make this the highest-value paid service.
2. **Validation API** — runs veraPDF + cv-strict + malicious corpus, returns JSON report. Free under 100/mo, metered above.
3. **Hosted viewer / `<cv-embed>` CDN** — Loom-for-resumes: shareable URLs, view analytics, password protection, expiry, custom domain. Free tier (3 public files), Pro $9/mo.
4. **Cross-`.cv` semantic search as a service** — recruiting-platform play; search across pre-embedded candidate pools.

**Risk controls specific to the paid tier:**
- **Vendor TOS:** OpenAI/Voyage/Google permit redistributing embedding outputs in the contractual sense, but ToS clauses make us processor-not-controller and clarify producer ownership. Lawyer review pre-launch.
- **Vendor outage:** packs with unavailable spaces queue with retries and finally degrade to a flagged "partial pack" rather than failing.
- **Cost runaway:** per-key rate limits, hard usage caps, email alerts, abuse heuristics.
- **Vendor model deprecation:** 90-day notice + email to all customers; archived dimension info preserved so old `.cv` files remain interpretable.

---

## Phased delivery

Every phase ships something a developer can install and use end-to-end. No infrastructure-only phases.

**Phase 0 — Foundations.** Repo scaffold, `spec/cv-0.1.md` first complete draft (marked pre-stable), 3 canonical fixtures, veraPDF Docker runner, license + contributing + security.

**Phase 1 — v0.1 minimum coherent shippable.** `@cvfile/sdk` + `cvfile` (PyPI) + `cv-go` 0.1.0 with `pack`/`extract`/`extractMarkdown`/`inspect`. Go `cv` CLI 0.1.0 with the same. `cvfile.org` landing page (no viewer yet). Tier 1 (unit) + Tier 3 (cross-SDK interop) green. **Explicit non-goals:** no embeddings, no validator, no viewer, no middleware, no desktop. *This is the moment we tweet "you can pack a CV today."*

**Phase 2 — v0.2 viewer + validator + embeddings.** `<cv-embed>` web component live, `cvfile.org/view` drag-drop demo, `cv validate` + SDK `validate()`, PDF/A-3u strict mode default in `pack`. **Embeddings ship in this phase** — `@cvfile/embed`, `cvfile[embed]`, `cv-go/embed` with BGE-M3 default, plus `extractEmbeddings()` + `searchSemantic()` everywhere. Tier 2 (veraPDF) + Tier 4 (Playwright) + Tier 6 (security) green.

**Phase 3 — v0.3 server + serve.** `@cvfile/server` (Express/Fastify/Hono), `cvfile.server` (ASGI+WSGI), `cv-go/middleware` (net/http+chi), `cv serve`. Tutorial extended for the curl conneg flow.

**Phase 4 — v0.4 desktop + file association.** Tauri 2 app shipping the same `viewer-web` UI. macOS notarized `.dmg`, Windows MSI signed, Linux `.deb`/`.rpm`/AppImage/Flathub. File-association registration on all three OSes. Auto-update channel. Tier 5 (desktop smoke) green.

**Phase 5 — v1.0 stabilization + IANA.** Lock the spec at 1.0, freeze breaking changes, submit IANA registration and Linux shared-mime-info MR, rebuild docs as proper Astro site, outreach (HN Show, ATS partners — Greenhouse/Lever, LLM document-loader integrations — LangChain/LlamaIndex). v1.0 stamped, six packages versioned in lockstep.

**Phase 6 — cvfile.org/cloud (paid hosted tier, weeks 22–28).** Account system (Clerk/Auth0), Stripe metered billing, KMS-backed vendor key vault, `api.cvfile.org` with `/v1/embed`, `/v1/normalize`, `/v1/validate`, `/v1/pack`. SDKs flip the previously-reserved `provider: 'cvfile-cloud'` from stub to real. Hosted viewer / `<cv-embed>` CDN follows shortly after. Free + BYO-key path remains unchanged — no capability regression.

**Post-1.0:** signed CVs (PAdES), encryption, expanded i18n metadata, `cv migrate`, plug-in renderers (LaTeX → `.cv`), cross-`.cv` semantic search service.

---

## Critical risks

1. **PDF/A-3u conformance under generation.** pdf-lib/pypdf/pdfcpu can embed `/AF` files but produce PDF/A-3u imperfectly from arbitrary input PDFs (color profiles, font subsetting, output intents are easy to drop). **Mitigation:** the `pack` pipeline normalizes input PDFs through a deterministic pass (qpdf + Ghostscript as a "PDF/A-ifier" sidecar). veraPDF is the gate. Document a `--no-pdfa` lenient mode. If pure-pdf-lib proves intractable, ship a WASM build of qpdf with the JS SDK. **Riskiest unknown — investigate on day 1.**
2. **pypdf weakness on PDF/A-3u.** pypdf is great at attachments but weaker than pikepdf on PDF/A normalization. The `_pdf.py` abstraction is built so we can swap to pikepdf cheaply.
3. **Cross-SDK byte-identical round-trip.** Different libraries serialize XMP, `/AF` arrays, xref tables differently. **Decision:** spec only requires *payload* bytes to round-trip identically; the wrapping PDF bytes are not required to be byte-identical across producers.
4. **IANA timeline.** Months. Tooling already emits `application/pdf` + cv XMP marker so adoption does not block on the registry.
5. **PDF.js bundle size.** ~600KB gz. Lazy-load on tab activation, slim build, consider server-side first-page PNG preview for hero embeds.
6. **Tauri file-association friction without notarization.** Apple developer cert ($99/yr) is non-optional for a real launch.
7. **Spec ambiguity + premature lock-in.** Ship v0.1 → v0.9 first (clearly pre-stable), gather interop feedback, only stamp v1.0 once all six SDK/viewer surfaces have shipped a release together.
8. **Embedding model availability and licensing churn.** BGE-M3 is MIT today but the open-weights ecosystem changes fast. Spec stores `model` + `modelRevision` so any frozen model snapshot is reproducible; we cache weights via HuggingFace in `~/.cache/cv/models/` keyed by revision.
9. **Embedding size inflation.** Per-section chunking on a typical CV: 10–20 chunks × 4KB ≈ 40–80KB extra. Acceptable. Document-level chunking flag for size-sensitive cases.
10. **Web component CSS isolation.** Lit Shadow DOM protects us; expose `::part()` for users who want to style the PDF.js canvas.

---

## Critical files / packages to create (modify list)

(Greenfield — everything is created.)

- `spec/cv-1.0.md`, `spec/cv-xmp-vocabulary.md`, `spec/cv-embeddings.md`
- `spec/test-vectors/{minimal,multilang,full}.cv`
- `packages/sdk-js/src/{pack,extract,validate,embeddings,xmp,detect}.ts`
- `packages/embed-js/src/{bge-m3,onnx-runner}.ts`
- `packages/cli/` (npm thin wrapper)
- `packages/viewer-core/src/{ViewerModel,markdownRenderer,htmlRenderer}.ts`
- `packages/viewer-web/src/{cv-embed.ts,index.ts}`
- `packages/viewer-desktop/` (Tauri 2 project)
- `packages/server-middleware-node/src/{conneg,handlers/{express,fastify,hono},loaders}.ts`
- `sdks/python/src/cvfile/{pack,extract,validate,embeddings,_pdf,_xmp}.py`
- `sdks/python/src/cvfile/server/{asgi,wsgi}.py`
- `sdks/go/cv/{pack,extract,validate,embeddings,xmp,internal/pdf}.go`
- `sdks/go/cmd/cv/main.go`
- `sdks/go/middleware/{conneg,nethttp,chi}.go`
- `interop/{matrix.yaml,runner-node.ts,runner-python.py,runner-go.go,compare.ts}`
- `docs/src/pages/{index.mdx,spec.mdx,view.tsx,tutorial/hello-cv.mdx}`
- `tools/verapdf-runner/Dockerfile`
- `tools/installer-payloads/{macos/Info.plist.snippet,windows/cvfile.reg.template,linux/{cvfile.desktop,application-vnd.cv+pdf.xml}}`
- `.github/workflows/{ci,interop,verapdf,release}.yml`

**Reusable libraries (do not reinvent):**
- pdf-lib (JS pack/extract) — https://pdf-lib.js.org/
- pypdf (Python pack/extract; possibly migrate to pikepdf)
- pdfcpu (Go pack/extract) — https://pdfcpu.io/
- PDF.js (web/desktop rendering) — https://mozilla.github.io/pdf.js/
- veraPDF (PDF/A-3u conformance gate) — https://verapdf.org/
- @xenova/transformers (JS ONNX embedding generation)
- sentence-transformers (Python embedding generation)
- BGE-M3 weights (HuggingFace `BAAI/bge-m3`, MIT)
- Lit (web component framework)
- Tauri 2 (desktop shell)
- DOMPurify + marked (markdown rendering)

---

## Verification plan

**Tier 1 — unit tests, per package.** Pack round-trip, inspect, validate (each prohibited construct triggers rejection).

**Tier 2 — PDF/A-3u conformance gate.** Dockerized veraPDF runs over `spec/examples/` corpus on every PR. Any FAILED verdict fails CI. **Bedrock test.**

**Tier 3 — cross-SDK interop.** `producers × consumers × fixtures` matrix (3 × 3 × 5 = 45 combos). Pack with one SDK, extract with another, assert payload bytes byte-identical and metadata semantically equal. A failure here = spec ambiguity, not a bug.

**Tier 4 — viewer rendering.** Playwright against `cvfile.org/view`; snapshot tests for PDF page 1, markdown DOM, HTML iframe. Lighthouse perf budget: TTFR < 2s for a 200KB `.cv` on 4G profile.

**Tier 5 — desktop smoke.** Tauri app launches on macOS/Windows/Linux runners, opens fixtures, switches tabs, no console errors. File-association test: simulate "open with" via OS API.

**Tier 6 — security regression.** `corpus-malicious/` directory: PDF with JS, encrypted, oversized, XML bombs, `javascript:` URI in MD, `<script>` in HTML. Validator rejects every one with documented error code. Viewer executes nothing.

**Tier 7 — embeddings sanity.** For each fixture: extract embeddings, run a known-positive query, assert top-1 chunk matches expected section. Verify chunk `textOffset`/`textLength` indices into `resume.md` correctly.

**End-to-end manual gate before any tagged release:**
1. `cv pack` a sample → open in macOS Preview, Adobe Reader, Chrome PDF viewer (must render visually).
2. `cv extract --format md` → diff against source markdown (must be byte-identical).
3. `curl -H "Accept: text/markdown" http://localhost:7373/sample.cv | diff - sample.md` (must match).
4. Drag onto `cvfile.org/view` → PDF, MD, HTML tabs all render.
5. `cv search sample.cv "founding engineer"` → top result is the experience section.
6. veraPDF strict pass.

---

## Alternatives considered and rejected (one-liners)

- **ZIP container (EPUB-style):** loses zero-install double-click. Rejected by user.
- **PDF/ZIP polyglot:** brittle, security-flagged, archive-tool incompatibilities.
- **PDF/A-2:** disallows arbitrary embedded files. Hard no.
- **HTML-primary:** no universal "open this offline" UX; email clients block.
- **JSON-LD primary metadata:** would need *another* embedded file; XMP is what PDF natively carries.
- **Nx instead of Turborepo:** heavier; no clear gain.
- **Rust CLI instead of Go:** roughly equivalent; Go wins because pdfcpu > current Rust PDF libs.
- **Electron desktop:** 80MB for a viewer is unjustifiable.
- **MIT vs Apache-2.0:** Apache wins for explicit patent grant during corporate adoption review. Spec ships CC-BY-4.0.
- **Built-in encryption in v1:** validator surface explodes; revisit v1.1.
- **Self-rolled PDF generation:** standing on pdf-lib/pypdf/pdfcpu is the right altitude.
- **Shipping embeddings only via external service (e.g., recommend RAG vendors index `.cv` files):** misses the value prop. Pre-computed embeddings *in* the file is the differentiator.
- **Mandating one fixed embedding model:** brittle as the open-weights ecosystem evolves. Pluggable + recommended baseline is the right ratchet.
