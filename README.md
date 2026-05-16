# .cv. One file. Every version of you.

A `.cv` file is your resume in every shape you need at once. The polished PDF a recruiter prints. The clean Markdown an applicant tracking system parses. The HTML a website embeds. The semantic vectors an AI tool searches. All four ride inside the same file. All four stay in sync. All four open with a double click in any PDF reader on day one.

## The problem this exists for

You finish your resume. You export a PDF for recruiters, paste a plain text copy into ATS forms, drop a Markdown version into a GitHub README, and embed an HTML rendering on your personal site. Two months later you tweak one of them. Now four versions disagree, three of them are wrong, and you have no idea which one a recruiter is actually reading.

`.cv` replaces that mess with **one file** you write once, publish once, and update once.

## Why now

* Recruiters and hiring managers increasingly skim resumes through AI assistants. Those assistants want clean text, not OCR scraped from a layout PDF.
* Applicant tracking systems reject the formatting recruiters liked. With `.cv` they read a textual payload that travels inside the same file as the printable version.
* RAG pipelines that index candidates re-tokenize and re-embed every PDF they see. With `.cv` the vectors are already there, ready to use.
* The whole thing is an open standard. Apache 2.0 code. CC BY 4.0 spec. No vendor. No paywall on the basics. No proprietary viewer. Your file works in Preview, Adobe Reader, Chrome, every PDF reader on every OS that has shipped in the last fifteen years.

## What this looks like in real life

**You are a job seeker.** You spent an evening polishing one resume in Figma. You export `resume.cv`. You upload that single file to Workday, Greenhouse, Lever, your LinkedIn profile, your portfolio site, and you email it to a recruiter. The recruiter opens the PDF inside the file and sees the design you intended. Workday's parser reads the Markdown copy inside the same file and fills every form field correctly, with the right accents and bullet characters intact. Two months later you update the file once. Everywhere it is hosted is current.

**You are a recruiter using an AI copilot.** Your sourcing tool ingests 8,000 candidate resumes. With ordinary PDFs the tool OCRs every layout, mangles tables, misses headers, and burns a fortune on embedding API calls. With `.cv` the tool reads the embedded Markdown and the precomputed BGE-M3 vectors directly. Search for "founding engineer python kubernetes Lyon" returns the right candidates in milliseconds. Latency drops. Cost drops. Quality goes up.

**You run a careers page.** You drop one `<cv-embed src="/team/jane.cv">` tag into your team page. The component renders the PDF for human visitors, exposes clean text that search engines and ATS crawlers can index (real text, no OCR fallback), and surfaces a "Download as PDF" button. One file. One source of truth. Zero JavaScript build pipeline to maintain.

**You publish a freelance bio.** You host `bio.cv` at a stable URL. When a browser visits the URL the server returns the visual PDF. When Anthropic's `ClaudeBot` or OpenAI's `GPTBot` visits with `Accept: text/markdown`, the same URL serves the Markdown copy, perfectly formatted. The AI agents quoting you on the open web start quoting accurate text instead of a paragraph mangled by OCR.

**You write your CV in two languages.** Your résumé exists in French and English. Both copies live inside the same `.cv` file as separate payloads with `cv:primaryLanguage="fr"` and an alternate in `en`. A French employer's tool reads the French copy. A US recruiter's tool reads the English copy. You version one file.

## What you can do with it

| You want to | `.cv` gives you |
| :--- | :--- |
| Send a resume that always looks right | A PDF/A-3u file that opens visually in any reader |
| Get parsed correctly by an ATS | A Markdown copy travelling inside the same file |
| Embed your CV on your website | A `<cv-embed src="resume.cv">` Lit component, 10 KB |
| Be searchable by an AI agent | Precomputed BGE-M3 vectors ready for any vector DB |
| Serve content negotiation on your site | Express, Fastify, Hono, FastAPI, Flask, Django, net/http adapters |
| Ship a CLI to your users | `brew install cvfile/tap/cv` and you are done |

## Quick start

```bash
# CLI (single Go binary, no Node or Python needed)
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

Three lines of code, one file out the other side.

## Where to go next

* **[cvfile.org](https://cvfile.org)** for the rendered spec, the live drag and drop viewer, and the install page.
* **[cvfile.org/spec/](https://cvfile.org/spec/)** for the normative `cv 1.0` specification.
* **[github.com/cvfile/cv/tree/main/integrations](./integrations)** for the LangChain, LlamaIndex, and Haystack loaders that any RAG pipeline can already use today.

---

## For developers and integrators

Spec is stable at **`cv-1.0`** (`spec/cv-1.0.md`).

### What's in this monorepo

| Path | What it ships |
| :--- | :--- |
| `spec/` | Normative `.cv-1.0` spec (CC BY 4.0) and IANA registration template |
| `spec/test-vectors/malicious/` | 7 mutated fixtures the validator must reject |
| `packages/sdk-js/` | `@cvfile/sdk`, pack, extract, inspect, validate (browser and Node) |
| `packages/embed-js/` | `@cvfile/embed`, chunker plus transformers.js and HF Inference backends |
| `packages/server-middleware-node/` | `@cvfile/server`, Express, Fastify, Hono, vanilla `http` |
| `packages/viewer-web/` | `@cvfile/viewer-web`, the `<cv-embed>` Lit component |
| `sdks/python/` | `cvfile` on PyPI, full SDK plus `cvfile.embed` plus `cvfile.server` (ASGI and WSGI) |
| `sdks/go/` | The Go library, the `cv` CLI binary, and a `net/http` middleware |
| `integrations/langchain-cvfile/` | LangChain document loader (PyPI: `langchain-cvfile`) |
| `integrations/llama-index-readers-cvfile/` | LlamaIndex reader (PyPI: `llama-index-readers-cvfile`) |
| `integrations/cvfile-haystack/` | Haystack 2.x converter (PyPI: `cvfile-haystack`) |
| `docs/` | The cvfile.org Astro site |
| `tools/verapdf-runner/` | Docker wrapper for the PDF/A-3u conformance gate |
| `tools/installer-payloads/` | macOS UTI plist, Windows `.reg`, Linux `.desktop` plus shared mime info |
| `tools/cv-detector/` | Reference sniffer (Python, Go, TypeScript) for crawler vendors |

### Status

* Spec stable at `1.0`. IANA registration template prepared.
* Three reference SDKs (JS, Python, Go) with cross language byte identical interop.
* veraPDF PASS for `cv-strict` output from JS and Python SDKs.
* 7 fixture malicious corpus, identical error codes across all three SDK validators.
* Real BGE-M3 round trip end to end via Hugging Face Inference (no local model download).
* `cv search` CLI produces semantic search results from the embedded vectors.
* Three HTTP middleware implementations (Node, Python ASGI plus WSGI, Go) with byte identical content negotiation.
* `<cv-embed>` viewer with ARIA tabs, keyboard nav, dark and light theming, mobile layout.
* LangChain `CVFileLoader`, LlamaIndex `CVFileReader`, and Haystack `CVFileToDocument`, all live on PyPI.
* Astro docs site builds 5 pages including a live drag and drop viewer demo.
* GoReleaser plus Homebrew, Scoop, WinGet templates.
* `cvfile-cv-detector` reference sniffer in Python, Go, and TypeScript: 200 line drop-in for any PDF crawler that wants `.cv` awareness without taking on the SDKs.

**157 tests passing across 8 packages and 3 languages.**

### Documents

| File | Purpose |
| :--- | :--- |
| [`spec/cv-1.0.md`](./spec/cv-1.0.md) | Normative format specification (stable) |
| [`spec/iana-registration-application-vnd-cv+pdf.txt`](./spec/iana-registration-application-vnd-cv+pdf.txt) | IANA media type registration template |
| [`PLAN.md`](./PLAN.md) | Architectural plan: container choice, business model, security model, phasing |
| [`ROADMAP.md`](./ROADMAP.md) | Sequenced phases, technical and business actions, gates, risks |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to contribute |
| [`SECURITY.md`](./SECURITY.md) | Threat model and disclosure policy |
| [`CHANGELOG.md`](./CHANGELOG.md) | What changed when |

### License

Code: **Apache 2.0**. Spec: **CC BY 4.0**.
