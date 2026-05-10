# `.cv` File Format — Specification, version 0.1 (pre-stable)

> **Status:** Pre-stable. Breaking changes are possible until `1.0` is stamped. Implementations are encouraged to advertise the exact version they target.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**, **REQUIRED**, **RECOMMENDED**, and **OPTIONAL** in this document are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)) when, and only when, they appear in all capitals.

## 1. Introduction

A `.cv` file bundles three coordinated representations of a single document, plus optional pre-computed embeddings:

- A designed **PDF** — what humans see.
- A clean **Markdown** copy — what bots, ATS systems, and LLMs read.
- A self-contained **HTML** rendering — what web pages embed.
- Optional **embeddings** — pre-computed vectors over the markdown so retrieval pipelines can skip an embedding pass.

A `.cv` file **IS** a valid PDF. Existing PDF readers open it without modification. The other representations are carried inside the PDF as PDF/A-3 Associated Files (`/AF`).

### 1.1 Goals

- One source of truth for a document, with three audience-specific representations always in sync.
- Zero-install human fallback: the file opens in any PDF reader on day one.
- Bot-ready: the markdown is trivial to extract for indexing, ATS parsing, and LLM context.
- Web-embeddable: the HTML is self-contained and ready to drop into a `<cv-embed>` web component.
- AI-ready: optional pre-computed embeddings let RAG pipelines index the file without re-embedding.
- Forward-compatible: unknown fields are ignored within the same major version.

### 1.2 Non-goals (in 0.x)

- Encryption (revisit in 1.1).
- Digital signatures (revisit in 1.x via PAdES).
- Multi-document containers (one document per `.cv`).

### 1.3 Conformance levels

- **`cv-strict`**: passes `veraPDF` PDF/A-3u conformance and satisfies every **MUST** in this spec.
- **`cv-lenient`**: is a valid PDF, carries the `cv:version` XMP marker, and contains at least one valid content payload. Useful for environments where producing PDF/A-3u is impractical.

Implementations **MUST** state which level they produce and **SHOULD** support reading both.

## 2. Terminology

- **Producer** — software that writes a `.cv` file.
- **Consumer** — software that reads a `.cv` file.
- **Container** — the wrapping PDF.
- **Payload** — a file embedded in the container via `/AF`.
- **Primary payload** — the payload that consumers should treat as the canonical text representation when no other preference applies. Identified by `cv:primaryPayload`.
- **Alternate payload** — a payload carrying the same content as the primary in another representation or language.
- **Supplement payload** — a payload that adds material not present in the primary (cover letter, portfolio link list, etc.).

## 3. Container

### 3.1 PDF version

A `.cv` file **MUST** be a valid PDF 1.7 or PDF 2.0 file.

### 3.2 PDF/A-3u conformance (`cv-strict`)

A `cv-strict` file **MUST** conform to PDF/A-3u (ISO 19005-3, Unicode level). PDF/A-3u is the only PDF/A level that permits arbitrary embedded files and that guarantees Unicode text extraction.

Practical implication: every font used in the visual PDF **MUST** be fully embedded (ISO 19005-3 § 6.2.11.4.1). Producers using standard 14 PDF base fonts by name (Helvetica, Times, Courier, Symbol, ZapfDingbats) will fail this requirement. Embedding is performed by the input-PDF generator, not by `.cv` packers — most modern producers (LaTeX/XeLaTeX, browser print-to-PDF, Word/LibreOffice export, headless Chromium) embed fonts by default.

### 3.3 Output intent

A `cv-strict` file **SHOULD** include an embedded ICC profile (typically sRGB IEC61966-2.1) referenced from a `/OutputIntent`.

### 3.4 Forbidden constructs

A `.cv` file **MUST NOT** contain:

- PDF JavaScript actions (`/JS` or `/JavaScript`).
- `/Launch` actions.
- `/ImportData` actions.
- `/SubmitForm` actions targeting any URI other than `mailto:`.
- An `/Encrypt` dictionary (no encryption in 0.x).
- External stream references (`/F` filespecs pointing to files outside the container).

Validators **MUST** reject files containing any of these.

## 4. Embedded payloads

Payloads are carried as PDF Associated Files via the `/AF` entry on the document catalog (see ISO 32000-2 §14.13).

### 4.1 Filespec dictionary requirements

Each `/Filespec` dictionary representing a `.cv` payload **MUST** set the following entries:

| Entry | Type | Requirement |
| --- | --- | --- |
| `/Type` | name | `/Filespec` |
| `/F` | string | filename in PDFDocEncoding |
| `/UF` | string (UTF-16BE BOM) | filename in Unicode |
| `/EF` | dict | embedded file dict with `/F` pointing to the stream |
| `/Desc` | string | human-readable description |
| `/AFRelationship` | name | one of `/Alternative`, `/Data`, `/Supplement` |
| `/Subtype` | name | MIME type as a name (e.g. `/text#2Fmarkdown`) |

The embedded file stream **MUST** include `/Params << /ModDate (...) /Size N /CheckSum <md5> >>` per the PDF spec.

### 4.2 Required content

A `.cv` file **MUST** carry at least one of:

- `resume.md` — `text/markdown; charset=UTF-8`, `/AFRelationship /Alternative`. **RECOMMENDED** as primary payload.
- `resume.html` — `text/html; charset=UTF-8`, `/AFRelationship /Alternative`. The HTML **SHOULD** be self-contained (inline CSS, no external `<script>`/`<link>`).

### 4.3 Optional content

- `resume.json` — `application/json`, `/AFRelationship /Alternative`. **SHOULD** follow [JSON Resume](https://jsonresume.org/) v1.0.0 schema.
- `embeddings.cbor` — `application/vnd.cv.embeddings+cbor`, `/AFRelationship /Data`. See §5.
- `attachments/<name>` — any MIME, `/AFRelationship /Supplement`.

### 4.4 Filename rules

Filenames **MUST** be POSIX-portable (matching `[A-Za-z0-9._/-]+`) and **SHOULD** be lowercase. Slashes denote logical grouping (e.g. `attachments/portfolio.pdf`); they have no required filesystem meaning.

For internationalised content, language-tagged filenames take the form `resume.<bcp47>.md` (e.g. `resume.fr.md`, `resume.zh-Hant.md`). The unsuffixed `resume.md` represents `cv:primaryLanguage`.

### 4.5 Ordering (informative)

Producers **SHOULD** order the `/AF` array as: primary payload, alternates by language, embeddings, supplements. This eases byte-identical round-trip testing across producers.

## 5. Embeddings payload

The `embeddings.cbor` payload carries one or more pre-computed vector representations of the markdown.

### 5.1 Schema

The CBOR document **MUST** be a map with the following keys:

```cddl
embeddings = {
  format-version: uint,                 ; this spec section version, current = 1
  spaces: [+ space],                    ; one or more embedding spaces
}

space = {
  model:           tstr,                ; model identifier (e.g. "BAAI/bge-m3")
  model-revision:  tstr,                ; pinned revision (e.g. HuggingFace commit sha)
  dimension:       uint,
  metric:          "cosine" / "dot" / "euclidean",
  normalized:      bool,
  chunking:        "document" / "section" / "paragraph",
  chunks:          [+ chunk],
}

chunk = {
  id:           tstr,                   ; stable id within the file (e.g. "experience")
  text-offset:  uint,                   ; byte offset into resume.md
  text-length:  uint,                   ; byte length within resume.md
  vector:       bstr,                   ; little-endian float32 array, length = dimension * 4
}
```

`vector` is a binary string of `dimension * 4` bytes containing little-endian IEEE 754 float32 values.

### 5.2 Recommended baseline model

Producers using a single embedding space **SHOULD** use `BAAI/bge-m3` (MIT, multilingual, 1024-dim, cosine, normalised). This permits cross-`.cv` comparison without an explicit agreement between producer and consumer.

### 5.3 Multiple spaces

Producers **MAY** include vectors in additional embedding spaces (e.g. `text-embedding-3-large`, `voyage-3`, `gemini-text-004`). Each space is independent; consumers select the space they trust. Producers **SHOULD NOT** ship more than four spaces in a single file.

### 5.4 Trust and verification

Consumers **MAY** recompute vectors from the matching model + revision and compare to the shipped vectors as a tampering check. The spec does not require this.

## 6. Metadata (XMP)

### 6.1 Namespace

The XMP namespace for this format is:

```
URI:    http://ns.cvfile.org/cv/1.0/
prefix: cv
```

### 6.2 Required properties

| Property | Type | Notes |
| --- | --- | --- |
| `cv:version` | text | Spec version, e.g. `"0.1"` or `"1.0"` |
| `cv:created` | xs:dateTime | ISO 8601 UTC, e.g. `"2026-05-10T12:00:00Z"` |
| `cv:primaryLanguage` | text | BCP-47 tag, e.g. `"en"`, `"fr-CA"` |
| `cv:primaryPayload` | text | Filename of the canonical text payload, e.g. `"resume.md"` |

### 6.3 Recommended properties

| Property | Type | Notes |
| --- | --- | --- |
| `cv:modified` | xs:dateTime | Last modification |
| `cv:generator` | text | Producer string, e.g. `"@cvfile/sdk/0.1.0"` |
| `cv:alternates` | rdf:Bag of struct | One entry per alternate payload: `{ payload, language, mimeType }` |
| `cv:integrity` | rdf:Bag of struct | One entry per payload: `{ payload, algorithm, digest }` |
| `cv:embeddings` | rdf:Bag of struct | One entry per embedding space: `{ model, dimension, metric, chunks }` |

### 6.4 Integrity

When `cv:integrity` is present, digests are computed over the unwrapped payload bytes (not the PDF EmbeddedFile stream). Algorithm names follow the IANA "Hash Function Textual Names" registry. `sha-256` is the recommended algorithm.

Validators **MUST** verify integrity entries when present and **MUST** fail validation on mismatch.

## 7. Security

### 7.1 Threat model

Untrusted `.cv` files arrive via email, web download, or chat. The attacker's goal is code execution, data exfiltration, or lateral movement when a recruiter or ATS opens the file.

### 7.2 Validator requirements

A conformant validator **MUST** reject files that contain any construct listed in §3.4. A conformant validator **MUST** verify integrity digests when present and reject on mismatch.

### 7.3 Renderer requirements

Viewers **MUST**:

- Render embedded HTML inside a sandboxed iframe with no `allow-scripts allow-same-origin`.
- Disable raw HTML when rendering Markdown by default. Producers may opt in to relaxed rendering with explicit sanitisation.
- Strip `javascript:` URIs from links.
- Cap decompressed payload size; default 16 MiB per payload.

### 7.4 XML parsing

XMP and any other XML inside the file **MUST** be parsed without DTD resolution and without external entity resolution.

## 8. Versioning and compatibility

### 8.1 Version format

`cv:version` follows `MAJOR.MINOR`. Pre-stable releases use `0.MINOR`.

### 8.2 Same-major compatibility

Within the same `MAJOR`:

- Producers **MAY** add new XMP properties under the `cv:` namespace.
- Producers **MAY** add new `/AF` entries with new `AFRelationship` values or new payload mime types.
- Consumers **MUST** ignore unknown XMP properties and continue rendering.
- Consumers **MUST** ignore `/AF` entries with unrecognised `AFRelationship` for rendering, but **MUST** return them in extraction APIs.

### 8.3 Cross-major behaviour

When a consumer encounters a `cv:version` with a higher `MAJOR` than it knows:

- It **SHOULD** still render the visual PDF (the file remains a valid PDF).
- It **MUST** surface a "newer format version" warning.
- It **MUST NOT** silently drop unknown payloads from extraction APIs.

### 8.4 Deprecation

Properties may be deprecated in a `MINOR` release but **MUST NOT** be removed within the same `MAJOR`. Removal requires a new `MAJOR`.

## 9. IANA considerations

Upon registration, the media type for `.cv` files will be:

- **Type:** `application`
- **Subtype:** `vnd.cv+pdf`
- **Required parameters:** none
- **Optional parameters:** none
- **Encoding considerations:** binary
- **Security considerations:** see §7
- **Interoperability considerations:** any PDF reader can open the file. `.cv`-aware tools additionally read the `/AF` payloads.

The filename extension is `.cv`.

## 10. References

### 10.1 Normative

- ISO 32000-2:2020, Document management — Portable document format — PDF 2.0
- ISO 19005-3:2012, Document management — Electronic document file format for long-term preservation — Part 3: Use of ISO 32000-1 with support for embedded files (PDF/A-3)
- ISO 16684-1:2019, Graphic technology — Extensible metadata platform (XMP)
- RFC 2119, RFC 8174, RFC 5646 (BCP 47), RFC 6838 (media-type registration)

### 10.2 Informative

- JSON Resume schema, https://jsonresume.org/
- veraPDF, https://verapdf.org/
- HuggingFace `BAAI/bge-m3`, https://huggingface.co/BAAI/bge-m3

## 11. Appendix A — Worked example

A minimal `cv-strict` file contains:

- A 1-page sRGB PDF/A-3u of a CV.
- An `/AF` array with one entry: `resume.md`.
- An XMP packet containing:
  ```xml
  <rdf:Description xmlns:cv="http://ns.cvfile.org/cv/1.0/">
    <cv:version>0.1</cv:version>
    <cv:created>2026-05-10T12:00:00Z</cv:created>
    <cv:primaryLanguage>en</cv:primaryLanguage>
    <cv:primaryPayload>resume.md</cv:primaryPayload>
    <cv:generator>@cvfile/sdk/0.1.0</cv:generator>
  </rdf:Description>
  ```

A consumer reads the catalog's `/AF` array, locates the `resume.md` filespec, decompresses the embedded file stream, and returns the Markdown.

## 12. Change log

- **0.1** (this document) — initial pre-stable draft.
