# `.cv` — End-to-End Execution Workflow

From the current state to a finished, in-market product. Sequenced phases, concrete deliverables, business actions interleaved with technical work, gates that decide when to advance.

This is the **operational** plan. The architectural decisions live in [`PLAN.md`](./PLAN.md) and the normative format definition lives in [`spec/cv-0.1.md`](./spec/cv-0.1.md). This document tells you what to do tomorrow, then the day after, until launch and beyond.

---

## Definition of "finished product"

`v1.0 launch` is the moment **all of these are true at once**:

1. The format spec is frozen at `1.0` and published at a stable URL on `cvfile.org`.
2. IANA has registered `application/vnd.cv+pdf` (or the application is in active review with all blockers resolved).
3. Six surfaces ship as version `1.0.0` in lockstep:
   - `@cvfile/sdk` on npm
   - `cvfile` on PyPI
   - `github.com/cvfile/cv/sdks/go` library + tagged release
   - `cv` CLI binary distributed via Homebrew, Scoop, WinGet
   - `cvfile.org/view` web viewer with `<cv-embed>` web component on a CDN
   - Native desktop viewers (macOS notarized .dmg, Windows MSI signed, Linux .deb/.rpm/AppImage) with `.cv` file association
4. The five reference middleware adapters (Express, Fastify, Hono for Node; ASGI + WSGI for Python; net/http + chi for Go) work with content negotiation.
5. `cvfile.org/cloud` is live with Stripe billing for the proprietary-embedding hosted tier.
6. At least three independent integrations ship: one LLM document-loader (LangChain or LlamaIndex), one ATS or job-board pilot, one open-source recruiting tool.
7. The IANA filing, the GitHub repo, the website, and the cloud business are owned by a stable legal entity (not a personal account).

Anything short of this is `0.x` — useful, public, ship-able, but the standard is not finished.

---

## Where we are today (Phase 0 complete)

Already shipped in this monorepo:

- `spec/cv-0.1.md` — full normative pre-stable draft.
- `@cvfile/sdk` 0.1.0 — pack, extract (markdown / html / embeddings parsed and raw), inspect, validate, isCvFile, encode/decode CBOR embeddings. **13 tests passing.**
- `@cvfile/viewer-web` 0.1.0 — Lit `<cv-embed>` component with PDF / Markdown / HTML tabs, lazy PDF.js worker, drag-drop demo. **Manually verified end-to-end.**
- `@cvfile/server` 0.1.0 — vanilla Node http handler + Express, Fastify, Hono adapters. Content negotiation with `Link` header advertising alternates. **21 tests passing.**
- Apache-2.0 license (code), CC-BY-4.0 (planned for spec).
- Two end-to-end demos verified: `build-jane-doe.ts` (pack → extract → integrity verify) and `serve-and-curl.ts` (HTTP content negotiation flow).
- macOS Quick Look opens `.cv` files visually; `file(1)` recognises them as PDF 1.7.

**Total today: 34 tests, 3 packages, 9.4 KB sample `.cv` round-trips byte-identical and renders visually.**

---

## Phase 1 — Cross-language proof (weeks 1–4)

**Goal**: prove the spec is implementable from a third tool, not just by accident of one library's quirks. Triple the language reach.

### Technical actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 1.1 | **veraPDF Docker runner** at `tools/verapdf-runner/` | sample `.cv` runs through veraPDF; output documented |
| 1.2 | **Diagnose pdf-lib PDF/A-3u gap** | clear yes/no on whether qpdf+Ghostscript normalisation sidecar is needed |
| 1.3 | If gap exists: **JS SDK qpdf-wasm sidecar** as opt-in fallback | sample `.cv` passes veraPDF strict |
| 1.4 | **Python SDK** `cvfile` 0.1.0 on PyPI: `pack`, `extract`, `extract_markdown`, `inspect`, `validate` | mirrors JS API; uses pypdf with internal abstraction |
| 1.5 | **Cross-SDK interop matrix** (`interop/`) | `producers × consumers × fixtures = 3×3×5 = 45 combos` green in CI |
| 1.6 | **Install Go via Homebrew**, scaffold `sdks/go/` | `go test ./...` passes empty harness |
| 1.7 | **Go SDK** `github.com/cvfile/cv/sdks/go` 0.1.0 with same API surface | round-trip with JS- and Python-produced fixtures |
| 1.8 | **Go `cv` CLI** at `sdks/go/cmd/cv` with `pack`, `extract`, `inspect` | binary built for darwin-arm64, runs |

### Business actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 1.B1 | **Reserve domain `cvfile.org`** (and `.com` defensively) | DNS configured, parked landing |
| 1.B2 | **Reserve GitHub org `cvfile`** | `cvfile/cv` repo created, code pushed |
| 1.B3 | **Reserve npm scope `@cvfile`**, PyPI name `cvfile`, Go module path `github.com/cvfile/cv/sdks/go` | placeholder 0.0.1 published if name-squatting risk is non-trivial |
| 1.B4 | **Reserve Homebrew tap `cvfile/tap`**, Scoop bucket `cvfile`, WinGet manifest space | tap repo `cvfile/homebrew-tap` created |

### Phase 1 exit gate

All three SDKs (JS, Python, Go) pass the cross-SDK interop matrix on every PR via GitHub Actions. The CLI binary runs on macOS. Domain and namespaces are owned.

---

## Phase 2 — Quality, embeddings reality, viewer polish (weeks 5–8)

**Goal**: harden everything, ship real embeddings (not placeholder vectors), polish the viewer, document.

### Technical actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 2.1 | **Validator hardening**: enumerate corpus of malicious fixtures (PDF JS, encrypted, oversized, XML bombs, `javascript:` URI in MD, `<script>` in HTML) | every malicious fixture rejected with documented error code in all three SDKs |
| 2.2 | **`cv-strict` mode default in `pack`** once §1.3 outcome known | `cv pack` produces veraPDF-clean output by default |
| 2.3 | **`@cvfile/embed`** package — transformers.js + ONNX Runtime + BGE-M3 weights cached via HuggingFace | demo `cv pack --embed-with bge-m3 sample.pdf sample.md -o sample.cv` produces real vectors |
| 2.4 | **Python `cvfile[embed]` extra** with sentence-transformers | parity with JS embed |
| 2.5 | **`cv search file.cv "query"`** CLI command with cosine search over embedded chunks | recovers expected section for known-positive queries |
| 2.6 | **Viewer polish**: keyboard nav, ARIA, dark mode, perf budget (TTFR < 2 s @ 4G for 200 KB `.cv`) | Playwright + axe checks green |
| 2.7 | **`cvfile.org/view`** standalone Astro app (drag-drop, sample gallery, "Copy embed code" snippet) | deployed to Vercel/Cloudflare Pages preview |
| 2.8 | **Tutorial `docs/tutorial/hello-cv.mdx`** | a fresh user can complete the 5-line snippet in <15 minutes |

### Business actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 2.B1 | **Logo + minimal brand**: wordmark, color palette, favicon, social card | shipped in `docs/brand/` |
| 2.B2 | **Form a legal entity** for cvfile.org (LLC in Delaware or equivalent in your jurisdiction) | EIN/equivalent obtained |
| 2.B3 | **Open business banking** + accounting (Mercury / Wise / local equivalent) | account funded |
| 2.B4 | **Apple Developer Program** ($99/yr) for eventual notarization | account active |
| 2.B5 | **Draft Terms of Service + Privacy Policy** for the eventual cloud tier (lawyer review) | published draft on cvfile.org |

### Phase 2 exit gate

Real BGE-M3 embeddings work end-to-end. Viewer demo is publicly accessible. Validator rejects all malicious corpus entries. Legal entity exists. Brand is consistent.

---

## Phase 3 — Distribution surface (weeks 9–11)

**Goal**: every developer in every ecosystem can install with one command. Reproducible builds. Versioned releases.

### Technical actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 3.1 | **Server middleware Python** (`cvfile.server` ASGI + WSGI) | parity with Node middleware; tests green |
| 3.2 | **Server middleware Go** (`cv-go/middleware` net/http + chi) | parity with Node + Python |
| 3.3 | **GoReleaser config** at `tools/release-binaries/` | cross-compiles `cv` to 6 targets in one CI job |
| 3.4 | **Homebrew tap formula** `cvfile/tap/cv` | `brew install cvfile/tap/cv` works |
| 3.5 | **Scoop bucket** `cvfile/cv` | `scoop install cv` works |
| 3.6 | **WinGet manifest** `cvfile.cv` | `winget install cvfile.cv` works |
| 3.7 | **`curl … \| sh` installer** at `cvfile.org/install.sh` | one-liner installs CLI on macOS / Linux |
| 3.8 | **`@cvfile/cli` npm wrapper** with postinstall binary download | `npx cv pack ...` works |
| 3.9 | **Changesets-driven release pipeline** for all six packages | one tag triggers six version bumps + publish |

### Business actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 3.B1 | **Code signing certificate** for Windows (DigiCert or equivalent, ~$200/yr) | cert in CI keychain |
| 3.B2 | **Trademark search** for "cv" — likely too generic; consider `cvfile` mark instead | clearance opinion documented |
| 3.B3 | **Set up cvfile.org email** (Google Workspace or equivalent) — `hello@`, `security@`, `support@` | MX records live, inboxes monitored |

### Phase 3 exit gate

Anyone in the world can install the CLI in one line on any major OS. Releases are tagged and reproducible. All six packages versioned in lockstep.

---

## Phase 4 — Desktop + native UX (weeks 12–15)

**Goal**: double-clicking a `.cv` opens a native app on a fresh laptop with zero terminal use.

### Technical actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 4.1 | **Tauri 2 project** at `packages/viewer-desktop/` loading `viewer-web` build | runs on macOS, Windows, Linux dev machines |
| 4.2 | **Sidecar integration** — bundle Go `cv` binary as Tauri sidecar for PDF parsing | viewer extracts payloads via sidecar IPC |
| 4.3 | **macOS .app + .dmg** with `Info.plist` UTI declaration (`org.cvfile.cv` conforming to `com.adobe.pdf`) | double-click `.cv` opens the app |
| 4.4 | **macOS notarization** + signed .dmg via Apple Developer cert | Gatekeeper accepts the app |
| 4.5 | **Windows MSI** with `.reg` entries for `HKEY_CLASSES_ROOT\.cv` | Windows file association works |
| 4.6 | **Windows code-signing** with DigiCert cert | SmartScreen warning suppressed |
| 4.7 | **Linux .deb, .rpm, AppImage** + `cvfile.desktop` + `application-vnd.cv+pdf.xml` | `xdg-mime default cvfile.desktop` works on Ubuntu, Fedora |
| 4.8 | **Flathub manifest** | published on Flathub |
| 4.9 | **Auto-update channel** (Tauri updater) | Tauri app checks for updates on launch |

### Business actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 4.B1 | **Cloudflare R2 / S3 bucket** for distributing installers + auto-update manifests | versioned + rollbackable |
| 4.B2 | **Privacy-first telemetry policy** — opt-in, anonymised, only aggregate (e.g., counter of unique installs) | documented in PRIVACY.md |

### Phase 4 exit gate

Three OS install flows tested on three clean machines. `.cv` files double-click to open. Auto-update works.

---

## Phase 5 — Standards + outreach (weeks 16–20)

**Goal**: lock the spec, get the IANA registration in flight, seed adoption in the AI/ATS ecosystem.

### Technical actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 5.1 | **Spec freeze at 1.0** (`spec/cv-1.0.md`) — final review pass, all referenced sections normative, RFC 2119 keywords audited | spec stable URL `cvfile.org/spec/1.0/` |
| 5.2 | **veraPDF + interop matrix green for 1.0** for two consecutive weeks | release blocker satisfied |
| 5.3 | **All six packages tagged 1.0.0** simultaneously via Changesets | published to npm, PyPI, Go, Homebrew, Scoop, WinGet, Flathub |
| 5.4 | **LangChain document loader** (`langchain.document_loaders.CvFileLoader`) | PR submitted, accepted |
| 5.5 | **LlamaIndex reader** (`llama_index.readers.cv.CvFileReader`) | PR submitted, accepted |
| 5.6 | **Haystack converter** | PR submitted |
| 5.7 | **`cvfile-cv-detector` reference sniffer** — 200-line library that detects `.cv` wrapper inside any `application/pdf` and unwraps `/AF` markdown | published as a tiny module any crawler vendor can adopt |

### Business actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 5.B1 | **IANA media-type registration** for `application/vnd.cv+pdf` filed under `cvfile.org` ownership via media-types@iana.org | submission acknowledged |
| 5.B2 | **shared-mime-info MR** for `.cv` extension | MR opened on freedesktop.org GitLab |
| 5.B3 | **Public docs site** at cvfile.org rebuilt as proper Astro site (rendered spec, tutorials, ecosystem page, blog, "Who's using it") | live |
| 5.B4 | **Launch post on Hacker News** ("Show HN: .cv — one file, three audiences, machine-ready") | scheduled with embargo coordination |
| 5.B5 | **Launch post on Product Hunt** | scheduled |
| 5.B6 | **Outreach to ATS vendors** (Greenhouse, Lever, Workday, Ashby, Pinpoint): pitch the format, offer integration help | five outreach emails sent, two replies pursued |
| 5.B7 | **Outreach to OpenAI, Anthropic, Google** developer relations: request `application/vnd.cv+pdf` special-casing in `file_search` / Files API / Vertex Search | three emails sent, follow-ups scheduled |
| 5.B8 | **Submit "Who's using `.cv`" placeholder partners** — get at least three pilots for the launch post | three logos secured |

### Phase 5 exit gate

`v1.0` is publicly tagged. IANA submission is acknowledged. At least three external integrations exist (LangChain + LlamaIndex + one ATS pilot). Hacker News post lives.

---

## Phase 6 — Cloud paid tier (weeks 21–28)

**Goal**: monetise without compromising the open standard. Hosted convenience for developers who'd rather pay than manage three vendor API keys + qpdf installs.

### Technical actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 6.1 | **`api.cvfile.org` Hono service** with `/v1/embed`, `/v1/normalize`, `/v1/validate`, `/v1/pack`, `/v1/usage` endpoints | deployed to Cloudflare Workers / Fly.io |
| 6.2 | **KMS-backed vendor key vault** (AWS KMS + Secrets Manager, or HashiCorp Vault) | OpenAI / Voyage / Google API keys stored, never in app DB |
| 6.3 | **Auth: Clerk or Auth0** + scoped API keys (`cv_live_XXX` / `cv_test_XXX`) | sign-up → key issuance flow live |
| 6.4 | **Stripe metered billing** integration with usage events | billable charges land in Stripe in real time |
| 6.5 | **Customer dashboard** (`cvfile.org/cloud`) showing packs, tokens, cost, current period | live; Lighthouse green |
| 6.6 | **SDK `provider: 'cvfile-cloud'` flips from stub to real** in JS / Python / Go | example in tutorial |
| 6.7 | **PDF/A-3u normalization service** — qpdf + Ghostscript pipeline behind `/v1/normalize` | accepts arbitrary PDF, returns PDF/A-3u-clean output |
| 6.8 | **Hosted viewer** — `cvfile.org/v/<id>` with shareable URLs, optional password, optional expiry, view analytics | Free tier 3 public files, Pro $9/mo |
| 6.9 | **Self-hosted runner Docker image** for Business tier | published to Docker Hub + GHCR |

### Business actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 6.B1 | **Stripe account** + tax registration as required (US: state-by-state nexus; EU: VAT MOSS via Merchant of Record like Paddle) | live, tested with $1 charge |
| 6.B2 | **Pricing page** at `cvfile.org/pricing` (Free / Cloud / Business) | live with concrete numbers and FAQ |
| 6.B3 | **Lawyer review** of cloud ToS, AUP, DPA (especially OpenAI/Voyage/Google sub-processor flow-down) | signed off |
| 6.B4 | **Status page** (`status.cvfile.org` via BetterStack or Statuspage) | live, monitoring all `/v1/*` endpoints |
| 6.B5 | **First 10 paying customers** lined up before public launch — 5 from ATS partners, 5 from LLM tooling shops | 10 signed letters of intent |
| 6.B6 | **Public cloud launch post** with the 10 logos as proof | published |

### Phase 6 exit gate

Real customers paying real money. Three months of stable usage, churn under 5%, MRR > $2k.

---

## Phase 7 — Growth + ecosystem (months 7–12)

**Goal**: become the default machine-readable resume format. Drive adoption through partnerships, not advertising.

### Technical actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 7.1 | **Cross-`.cv` semantic search service** — bulk index millions of `.cv` files, search across them | Business-tier feature live |
| 7.2 | **JATS / EuroPass / HR-XML import-export** — `cv import europass.xml -o resume.cv` | three import formats supported |
| 7.3 | **Resume builder reference app** (`cvfile.org/build`) — fill a form, generate a `.cv` | live, free |
| 7.4 | **GitHub Action `cvfile/pack-action`** for CI pipelines | published in marketplace |
| 7.5 | **Browser extension** to right-click any LinkedIn / GitHub profile and "Save as .cv" | published in Chrome Web Store + Firefox AMO |

### Business actions

| Step | Deliverable | Gate |
| --- | --- | --- |
| 7.B1 | **First 3 ATS integrations live** (Greenhouse, Lever, one other) | listed in their app stores |
| 7.B2 | **First LLM platform native support** (whichever vendor moves first) | announced jointly with the vendor |
| 7.B3 | **Conference talks**: PyCon, GopherCon, JSConf, RubyConf — propose talks on the format, the SDKs, the open-core model | 2 talks accepted |
| 7.B4 | **Paid partner program** for ATS vendors: revenue-share for cloud volume they generate | drafted, two partners signed |
| 7.B5 | **Hire first engineer** if MRR > $20k and pipeline is clear | hired |

### Phase 7 exit gate

`.cv` is on the front page of the resume / hiring conversation. Three ATS partners live. Self-sustaining MRR.

---

## Phase 8 — Long-term standards (months 13+)

**Goal**: keep the format alive, evolve it without breaking. Build the moat.

| Direction | Outline | When |
| --- | --- | --- |
| `v1.1` | **Encryption**: per-payload encryption with AES-256, recipient public-key envelopes | months 13–15 |
| `v1.2` | **Digital signatures**: PAdES-LTV signatures over the `.cv` for tamper-evidence | months 16–18 |
| `v1.3` | **Expanded i18n metadata**: locale-aware section IDs in embeddings, translation provenance | months 18–20 |
| `v2.0` | **Plug-in renderers**: LaTeX → `.cv`, Typst → `.cv`, .docx → `.cv`; standardised renderer plug-in interface | months 21–24 |
| Standards body | Move spec custody from cvfile.org to a neutral standards body (W3C, OASIS, or new "CVFile Foundation") | year 2 |
| Enterprise tier | On-prem deployment of the cloud stack as a self-hosted product for ATS vendors who can't use SaaS | year 2 |

---

## Critical path

The longest dependency chain through this roadmap:

```
Phase 1 veraPDF check (1.1)
  → Phase 2 cv-strict default (2.2)
    → Phase 5 spec freeze 1.0 (5.1)
      → Phase 5 IANA filing (5.B1)              ← months of wall-clock
        → Phase 5 platform vendor outreach (5.B7)
          → Phase 7 first LLM native support (7.B2)
```

And the parallel chain for distribution:

```
Phase 1 Go SDK (1.7-1.8)
  → Phase 3 GoReleaser + Homebrew/Scoop/WinGet (3.3-3.6)
    → Phase 4 Tauri sidecar (4.2)
      → Phase 4 OS-signed installers (4.4, 4.6)  ← Apple notarization wall-clock
        → Phase 5 simultaneous v1.0 release (5.3)
```

If you have to defer something, defer Phase 7 and 8 work, never Phase 5 outreach.

---

## Risks and contingencies

| Risk | Likelihood | Impact | Mitigation | Trigger to escalate |
| --- | --- | --- | --- | --- |
| pdf-lib never produces clean PDF/A-3u | Medium | High — blocks `cv-strict` claim | qpdf-wasm sidecar in JS SDK; pikepdf in Python; pdfcpu may be enough in Go | Phase 1.2 conclusion |
| IANA registration takes 6+ months | Medium | Medium — delays vendor adoption asks | tooling already emits `application/pdf` + cv XMP marker; Link header advertises target MIME from day one | Phase 5.B1 still pending after week 24 |
| LLM vendor refuses to special-case the MIME | High | Medium — limits "native" recognition story | sniffer reference implementation + LangChain/LlamaIndex/Haystack integrations; emphasis pivots to RAG-developer audience | After two declined outreach attempts |
| Apple notarization snags on Tauri sidecar | Medium | Medium — delays desktop launch | run notarization spike in Phase 4.1, not at Phase 4.4; have non-sidecar fallback (Rust port of read-only ops) | Notarization fails twice |
| Stripe / Merchant-of-Record VAT compliance complexity | High | Medium — delays Phase 6 launch | use Paddle as MoR from day one for EU; restrict initial Cloud tier to US/CA | Lawyer flags > 4 weeks of compliance work |
| Format adopters demand encryption before they'll trust it for compliance content | Medium | High — kills Business-tier sales | accelerate v1.1 encryption work into Phase 6 if first 5 customer conversations all raise it | 3 of 5 sales calls raise it |
| Open-core gets forked by a vendor offering hosted that we can't beat on price | Low | High — disrupts cloud business | keep SDK fully capable for free; differentiate on convenience + observability + multi-vendor key consolidation, not on "we have the only embedder" | A vendor announces hosted .cv pricing under ours |
| Spec ambiguity surfaces after 1.0 freeze | Medium | High — forces a 2.0 break | freeze only after two consecutive weeks of green interop matrix + 6-week public RC period | Any contradiction surfaces post-RC |

---

## Cadence and hygiene

- **Weekly**: green interop matrix, green veraPDF, no flaky tests.
- **Bi-weekly**: changeset release of any package with new commits (small versions, frequent ships).
- **Monthly**: spec change-log entry; Hacker News / Lobsters / mailing-list update; revenue + churn report (Phase 6+).
- **Quarterly**: roadmap retrospective (this document); risk register review; partner check-ins.

Never ship a release without:
1. Green interop matrix
2. Green veraPDF
3. Updated `CHANGELOG.md`
4. A migration note if the change touches the spec

---

## What I'm doing tomorrow (default execution)

If you say "go", in this order I will:

1. Run `tools/verapdf-runner/` against the demo `.cv` and report the conformance verdict (Phase 1.1–1.2).
2. If pdf-lib output passes, stamp `cv-strict` mode default for Phase 2; else add the qpdf-wasm sidecar work to Phase 1.
3. Scaffold `sdks/python/` with `pyproject.toml`, `uv` setup, `pypdf` dependency, and the first `pack()` + `extract()` functions (Phase 1.4).
4. Build the cross-SDK interop runner (Phase 1.5) — even a 2×2 matrix at first (JS-produces × Python-extracts and reverse).
5. `brew install go` then scaffold `sdks/go/` with `go.mod`, `cv` package, and the first `Pack()` + `Extract()` (Phase 1.6–1.7).

Each step is committed (if you authorize a `git init`) with a descriptive message and an updated `CHANGELOG.md` entry.

When Phase 1 closes, I'll surface a checkpoint with the veraPDF outcome and ask whether to proceed straight to Phase 2 or pause to adjust priorities.
