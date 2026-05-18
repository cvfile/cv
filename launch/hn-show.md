# Show HN launch post

Pick the title at submit time. All four titles fit the 80 char limit.

## Title options

1. Show HN: .cv, a single file that carries your resume as PDF, Markdown, HTML
2. Show HN: An open file format for resumes (PDF/A-3u + Markdown + embeddings)
3. Show HN: .cv, one file, every shape your resume needs (PDF, MD, HTML, vectors)
4. Show HN: A resume file format that opens in any PDF reader and parses cleanly

Recommended: **#1**. Concrete, leads with the artifact, no jargon in the title.

## URL

`https://cvfile.org`

## First comment (the part HN actually reads)

Hi HN, I built `.cv`, an open file format for resumes. The goal is one file that you author once and that every audience reads correctly. A `.cv` is a valid PDF/A-3u that carries the Markdown copy and the HTML copy as PDF Associated Files (ISO 32000 §14.13), plus optional precomputed BGE-M3 embeddings as a CBOR sidecar.

What that buys you in practice:

* A recruiter double clicks the file. It opens in Preview, Adobe Reader, Chrome, Firefox, every PDF viewer that shipped in the last fifteen years, no install. The visual layer is the resume they designed.
* An ATS or AI tool reads the same URL with `Accept: text/markdown` and gets the Markdown payload back, perfectly formatted. No OCR over a layout PDF. No reflow garbage.
* A RAG pipeline that already indexes candidates reads `embeddings.cbor` and skips the re-embedding step entirely. The chunk offsets index back into the Markdown so a vector hit maps to source text without retokenizing.
* You publish one URL. Content negotiation hands each audience the representation it wants. The format is producer side convenience and consumer side invisible.

What is shipped today (v1.0, MIT / Apache 2.0 / CC BY 4.0):

* **Spec** at https://cvfile.org/spec/. PDF/A-3u container, `cv:` XMP namespace, `/AF` payload conventions, security model, embeddings schema.
* **SDKs** in three languages: `@cvfile/sdk` (npm), `cvfile` (PyPI), `cv-go` (Go module). Same API surface: pack, extract, inspect, validate. Cross SDK byte identical payload round trip is gated on every PR.
* **CLI** `cv` (single Go binary). `brew install cvfile/tap/cv`, Scoop bucket, WinGet manifest queued. Subcommands: pack, extract, inspect, validate, search.
* **Embeddings** in `@cvfile/embed` and `cvfile[embed]`. BGE-M3 default (MIT, multilingual, 1024 dim). Pluggable: openai-3-large, voyage-3, gemini-text-004 with your own keys. The SDK calls vendors directly. No middleman.
* **Web component** `<cv-embed>` (Lit, ~10 KB shell, lazy loads PDF.js when the PDF tab opens). Drop into any HTML page.
* **HTTP middleware** for seven frameworks (Express, Fastify, Hono, vanilla Node http, FastAPI, Flask, Django, Go net/http) that does the `Accept` and `Accept-Language` negotiation correctly with `Vary` and ETag set.
* **RAG integrations** on PyPI: `langchain-cvfile`, `llama-index-readers-cvfile`, `cvfile-haystack`. Drop in document loaders that emit one chunk per embedding.
* **Reference sniffer** `cvfile-cv-detector` (PyPI / npm / Go module). 200 line zero dep detector and unwrapper for crawler vendors who want `.cv` awareness without adopting an SDK.
* **Live demo** at https://cvfile.org/view/ (drag and drop a `.cv`, flip between PDF, MD, HTML).
* **In browser builder** at https://cvfile.org/create/ (drop a PDF, paste Markdown, get a `.cv` back, no server, no account).

What is in flight:

* IANA registration of `application/vnd.cv+pdf` submitted via `contact@cvfile.org`. Two to six week timeline.
* PRs open at LangChain and LlamaIndex (upstream integration paths).
* shared mime info MR queued for after IANA approval.

What is honest to flag:

* The desktop viewer (Tauri 2) is built but not signed. Apple Developer ID + Windows code signing cert pending. Until those land, downloads are unblocked binaries only.
* The paid hosted tier (`api.cvfile.org`) is post 1.0, behind legal entity formation. The open SDK does everything the cloud will do, including direct vendor embedding calls with your own keys. That is non negotiable: if `.cv` ever forks, it forks because the cloud got in the way of the free path.
* `.cv` does not magically make ChatGPT or Claude unwrap the inner Markdown payload. Today they OCR the visual layer like any other PDF. The realistic delivery path is HTTP content negotiation (which is shipped) plus vendor integration outreach (which is in progress). The reference sniffer is there so any crawler can adopt it in an afternoon.

The repo is https://github.com/cvfile/cv. Spec is at `spec/cv-1.0.md`. I would love feedback on the spec, the embeddings schema, the conneg algorithm, and on the path to native LLM crawler recognition. Happy to answer anything.

## Notes for posting

* Post Tuesday or Wednesday, 8 to 10 am Pacific.
* Do not post any extra comments in the first hour beyond the first comment above.
* Reply to every top level comment within 15 minutes for the first three hours.
* If asked about pricing, point to https://cvfile.org/ (the persona splits) and the open core position.
* If asked "why not JSON Resume / FRESH / Europass", the comparison table is at https://cvfile.org/ scroll to "How is this different from existing formats".
* Do not link to the desktop binaries until they are signed.
