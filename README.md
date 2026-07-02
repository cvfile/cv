# .cv, the open resume file format

[![spec](https://img.shields.io/badge/spec-cv%201.0-blue)](https://cvfile.org/spec/)
[![npm @cvfile/sdk](https://img.shields.io/npm/v/@cvfile/sdk?label=%40cvfile%2Fsdk)](https://www.npmjs.com/package/@cvfile/sdk)
[![PyPI cvfile](https://img.shields.io/pypi/v/cvfile?label=pypi%20cvfile)](https://pypi.org/project/cvfile/)
[![code license](https://img.shields.io/badge/code-Apache--2.0-green)](./LICENSE)
[![spec license](https://img.shields.io/badge/spec-CC%20BY%204.0-green)](./spec/cv-1.0.md)

**A `.cv` file is a single resume file that is a printable PDF, a clean Markdown copy for applicant tracking systems, an HTML rendering for the web, and precomputed semantic vectors for AI search, all inside one file that stays in sync and opens with a double click in any PDF reader.**

`.cv` is an open file format (Apache 2.0 code, CC BY 4.0 spec, IANA media type `application/vnd.cv+pdf`). The visual layer is a standard PDF/A-3u, so the file opens in Preview, Adobe Reader, and Chrome on day one. The machine-readable copies (Markdown, HTML, JSON Resume, and BGE-M3 embeddings) ride inside the same file as PDF/A-3 attachments, addressed by XMP metadata in the `cv:` namespace and protected by per-payload SHA-256 integrity digests.

```bash
brew install cvfile/tap/cv      # CLI (single Go binary)
pnpm add @cvfile/sdk            # JavaScript / TypeScript
pip install cvfile             # Python
go get github.com/cvfile/cv/sdks/go   # Go
```

---

## Table of contents

- [What is a .cv file?](#what-is-a-cv-file)
- [Why .cv exists](#why-cv-exists)
- [How it works](#how-it-works)
- [Install](#install)
- [Usage](#usage)
- [Use cases](#use-cases)
- [`.cv` vs the alternatives](#cv-vs-the-alternatives)
- [Packages and SDKs](#packages-and-sdks)
- [Specification and conformance](#specification-and-conformance)
- [Security model](#security-model)
- [FAQ](#faq)
- [Project status](#project-status)
- [Contributing and license](#contributing-and-license)

## What is a .cv file?

A `.cv` file is a resume saved once and readable by every consumer in the shape that consumer needs:

- **Humans** open it as a normal PDF and see the design you intended.
- **Applicant tracking systems (ATS)** read the embedded **Markdown** copy and fill form fields with the right accents and bullet characters, instead of mangling a layout PDF.
- **Websites** embed it with one tag and expose crawler-readable text (real text, not OCR).
- **AI agents and RAG pipelines** read the embedded Markdown and the precomputed **BGE-M3 embeddings** directly, with no re-OCR and no re-embedding pass.

One file. You write it once, publish it once, and update it once. Every copy inside stays consistent because they travel together and are integrity-checked.

## Why .cv exists

You finish your resume, then you export a PDF for recruiters, paste plain text into ATS forms, drop Markdown into a GitHub profile, and embed HTML on your site. Two months later you edit one of them. Now four versions disagree, three are stale, and you cannot tell which one a recruiter is actually reading.

`.cv` collapses those four artifacts into one. The reasons this matters now:

- Recruiters increasingly read resumes through AI assistants that want clean text, not OCR scraped from a layout PDF.
- ATS parsers reject the formatting recruiters liked; `.cv` gives them a textual payload inside the same file as the printable version.
- RAG pipelines re-tokenize and re-embed every PDF they index; `.cv` ships the vectors already computed.
- It is an open standard with no vendor, no proprietary viewer, and no paywall on the basics.

## How it works

A `.cv` file is a **PDF/A-3u** document with embedded files (`/AF` associated files):

| Payload | MIME type | Purpose |
| :--- | :--- | :--- |
| the PDF body | `application/pdf` | the visual resume any reader displays |
| `resume.md` | `text/markdown` | canonical text for ATS and AI (the primary payload) |
| `resume.html` | `text/html` | web rendering |
| `resume.json` | `application/json` | structured data (JSON Resume schema) |
| `embeddings.cbor` | `application/vnd.cv.embeddings+cbor` | per-chunk BGE-M3 vectors (little-endian float32) with UTF-8 byte offsets back into `resume.md` |

XMP metadata in the `cv:` namespace records `cv:version`, `cv:primaryLanguage`, `cv:primaryPayload`, alternates, integrity digests, and embedding-space summaries. Each payload is covered by a SHA-256 digest so a consumer can verify nothing was tampered with. Multiple languages live side by side as alternate payloads (for example `cv:primaryLanguage="fr"` with an English alternate).

On the web, a single URL serves the right representation by **content negotiation**: a browser (`Accept: text/html`) gets the visual PDF, while an AI crawler sending `Accept: text/markdown` gets the Markdown copy from the same URL.

## Install

```bash
# CLI: single Go binary, no Node or Python required
brew tap cvfile/tap && brew install cv

# JavaScript / TypeScript (Node and browser)
pnpm add @cvfile/sdk          # core: pack, extract, inspect, validate
pnpm add @cvfile/embed        # chunking + embedding backends
pnpm add @cvfile/server       # Express / Fastify / Hono content negotiation
pnpm add @cvfile/viewer-web   # <cv-embed> web component

# Python (3.10+)
pip install cvfile            # core SDK
pip install "cvfile[embed]"   # + chunking and embedding helpers

# Go (reader + writer)
go get github.com/cvfile/cv/sdks/go
```

Web component via CDN:

```html
<script type="module" src="https://cvfile.org/embed/1/cv-embed.js"></script>
<cv-embed src="resume.cv" view="auto" theme="auto"></cv-embed>
```

## Usage

### JavaScript / TypeScript

```ts
import { pack, extractMarkdown, inspect, validate } from '@cvfile/sdk';

// Create a .cv from a PDF + its text copies
const cvBytes = await pack({
  pdf: await readFile('resume.pdf'),
  markdown: await readFile('resume.md', 'utf8'),
  html: await readFile('resume.html', 'utf8'),
  metadata: { primaryLanguage: 'en', primaryPayload: 'resume.md' },
});

// Read it back
const md = await extractMarkdown(cvBytes);
const meta = await inspect(cvBytes);          // version, payloads, integrity, embeddings
const report = validate(cvBytes);             // rejects forbidden / tampered files
```

### Python

```python
from cvfile import pack, extract_markdown, inspect, validate

cv_bytes = pack(
    pdf=open("resume.pdf", "rb").read(),
    markdown=open("resume.md", encoding="utf-8").read(),
    metadata={"primary_language": "en", "primary_payload": "resume.md"},
)

md = extract_markdown(cv_bytes)
meta = inspect(cv_bytes)
report = validate(cv_bytes)
```

### Command line

```bash
cv inspect  resume.cv --json          # metadata, payloads, integrity, embeddings
cv extract  resume.cv --format md     # md | html | pdf (default: pdf)
cv validate resume.cv --strict        # conformance + integrity + security checks
cv search   resume.cv "python kubernetes Lyon" --k 5   # semantic search (needs HF_TOKEN)
```

### Go

```go
import cv "github.com/cvfile/cv/sdks/go/cv"

file, _ := cv.Extract(data)        // metadata + every payload
report := cv.Validate(data, cv.ValidateOptions{})
md, _ := cv.ExtractMarkdown(data, "")
out, _ := cv.Pack(cv.PackInput{PDF: pdfBytes, Markdown: []byte(md)})
```

### Server content negotiation

```ts
import { cvHandler } from '@cvfile/server';
// Browser gets the PDF; `Accept: text/markdown` gets the Markdown copy; ?format= overrides.
app.use(cvHandler({ root: './public' }));
```

## Use cases

**Job seeker.** Export `resume.cv` once and upload the same file to Workday, Greenhouse, Lever, LinkedIn, and your portfolio, and email it to a recruiter. The recruiter sees your design; the ATS reads the Markdown copy and fills fields correctly. Update the file once and every host is current.

**Recruiter with an AI copilot.** A sourcing tool that ingests thousands of resumes reads the embedded Markdown and precomputed vectors directly instead of OCRing layouts and paying to re-embed. Search returns the right candidates faster and cheaper.

**Careers page.** Drop `<cv-embed src="/team/jane.cv">` into a team page. It renders the PDF for humans and exposes clean, indexable text in the light DOM for search engines and ATS crawlers.

**Freelance bio under content negotiation.** Host `bio.cv` at a stable URL. Browsers get the visual PDF; `ClaudeBot` or `GPTBot` requesting `text/markdown` get accurate Markdown from the same URL, so AI agents quote correct text instead of OCR noise.

**Bilingual resume.** French and English copies live in one file as alternate payloads. A French employer's tool reads the French copy; a US recruiter's tool reads the English copy. You version one file.

## .cv vs the alternatives

| Need | Plain PDF | Four separate files | `.cv` |
| :--- | :--- | :--- | :--- |
| Looks right for humans | yes | yes | yes |
| Clean text for ATS | OCR, lossy | yes, if kept in sync | yes, in the same file |
| Web embed with indexable text | no | manual | one tag |
| Precomputed AI search vectors | no | no | yes |
| One source of truth | yes | no, drifts | yes |
| Opens in any PDF reader | yes | n/a | yes |

## Packages and SDKs

| Package | Registry | What it does |
| :--- | :--- | :--- |
| `@cvfile/sdk` | npm | pack, extract, inspect, validate (Node + browser) |
| `@cvfile/embed` | npm | Markdown chunker + transformers.js / HF Inference embedding backends |
| `@cvfile/server` | npm | content negotiation for Express, Fastify, Hono, vanilla `http` |
| `@cvfile/viewer-web` | npm | `<cv-embed>` Lit component (PDF / Markdown / HTML tabs, lazy PDF.js) |
| `@cvfile/mcp` | npm | MCP server: list, validate, read, pack, and semantic search over local .cv files from AI agents |
| `cvfile` | PyPI | full Python SDK + `cvfile.embed` + `cvfile.server` (ASGI / WSGI) |
| `cv` CLI | Homebrew / Scoop (WinGet planned) | single Go binary: pack, inspect, extract, validate, search |
| Go SDK | `go get` | pack, extract, inspect, validate + `net/http` middleware |
| `langchain-cvfile` | PyPI | LangChain document loader (loads text + per-chunk vectors) |
| `llama-index-readers-cvfile` | PyPI | LlamaIndex reader |
| `cvfile-haystack` | PyPI | Haystack 2.x converter |
| `@cvfile/cv-detector` (npm), `cvfile-cv-detector` (PyPI) | npm / PyPI | dependency-free `.cv` sniffer for crawler vendors (Go / Python / TS) |

## Specification and conformance

- The normative spec is **[`cv 1.0`](./spec/cv-1.0.md)** (rendered at [cvfile.org/spec](https://cvfile.org/spec/)).
- Media type: `application/vnd.cv+pdf` (IANA registration template in [`spec/`](./spec/)).
- The visual container is **PDF/A-3u**; output is checked with veraPDF in CI.
- Three reference SDKs (JavaScript, Python, Go) read each other's files byte-for-byte, with integrity digests verified across implementations.
- Chunk offsets are **UTF-8 byte offsets** into `resume.md`, so vectors map back to the correct substring across SDKs even for non-ASCII resumes.

## Security model

A conformant validator rejects files that try to weaponize the PDF container (spec §3.4). `.cv` validators in all three languages reject:

- encrypted documents,
- `/JavaScript` and `/JS` actions (including the document-level names tree),
- `/Launch` actions (running external programs),
- `/ImportData` actions,
- external `/Filespec` references,
- `/SubmitForm` actions targeting non-`mailto:` URIs.

Integrity digests are verified on read and validation fails on mismatch. The web component renders untrusted HTML payloads inside a locked-down sandboxed iframe and sanitizes Markdown before display. See [`SECURITY.md`](./SECURITY.md).

**Untrusted files.** `extract()` in all SDKs returns payloads as-is: it does not run the forbidden-construct scan, verify integrity digests, or enforce size caps. Consumers accepting `.cv` files from untrusted sources MUST call `validate()` first and reject the file on any error (CLI: `cv validate`). Only extract from files that passed validation.

## FAQ

**What is the `.cv` file format?**
An open resume format: a PDF/A-3u file that also carries a Markdown copy, an HTML copy, a JSON Resume copy, and precomputed BGE-M3 embeddings as embedded attachments, all kept in sync inside one file.

**Does a `.cv` file open in a normal PDF reader?**
Yes. The visual layer is a standard PDF/A-3u, so Preview, Adobe Reader, Chrome, and any PDF reader from the last fifteen years open it by double click.

**How is `.cv` different from a normal PDF resume?**
A normal PDF only has the visual layer; tools must OCR it to get text. A `.cv` file carries clean text, HTML, structured JSON, and AI search vectors inside the same file, so ATS and AI tools read accurate data with no OCR.

**How do applicant tracking systems read a `.cv` file?**
They read the embedded `resume.md` Markdown payload (the primary payload), which preserves accents and bullet characters, instead of parsing the layout PDF.

**What are the embedded embeddings for?**
They are precomputed BGE-M3 vectors (per chunk, with UTF-8 byte offsets into the Markdown) so a RAG pipeline or sourcing tool can do semantic search without re-embedding the resume.

**Is `.cv` free and open source?**
Yes. The reference code is Apache 2.0 and the specification is CC BY 4.0. There is no proprietary viewer and no vendor lock-in.

**What languages and frameworks are supported?**
JavaScript/TypeScript, Python, and Go SDKs; a CLI; a web component; HTTP content-negotiation middleware for Express, Fastify, Hono, ASGI (FastAPI/Starlette), WSGI (Flask/Django), and Go `net/http`; and LangChain, LlamaIndex, and Haystack loaders.

**How do I create a `.cv` file?**
Use `@cvfile/sdk` (JavaScript), `cvfile` (Python), or the Go SDK to `pack` a PDF together with its Markdown/HTML/JSON copies and optional embeddings, or run `cv pack` from the CLI.

## Project status

- Spec stable at `1.0`; IANA registration template prepared.
- Reference SDKs in JavaScript, Python, and Go with cross-language, byte-identical interop.
- veraPDF PDF/A-3u conformance checked in CI for SDK output.
- Shared malicious-fixture corpus rejected with identical error codes by all three validators.
- Real BGE-M3 round trip end to end via Hugging Face Inference (no local model download).
- Content negotiation in Node, Python (ASGI + WSGI), and Go with matching behavior.
- `<cv-embed>` viewer with ARIA tabs, keyboard navigation, light/dark theming, and a responsive layout.
- LangChain, LlamaIndex, and Haystack loaders live on PyPI, loading text and per-chunk vectors.

## Contributing and license

- [`spec/cv-1.0.md`](./spec/cv-1.0.md): the normative format specification.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): how to contribute.
- [`SECURITY.md`](./SECURITY.md): threat model and disclosure policy.
- [`CHANGELOG.md`](./CHANGELOG.md): release history.

Code is licensed **Apache 2.0**; the specification is licensed **CC BY 4.0**.

Learn more at **[cvfile.org](https://cvfile.org)**.
