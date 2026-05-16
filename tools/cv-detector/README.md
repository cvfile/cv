# cvfile-cv-detector

A 200-line reference sniffer for the `.cv` open file format.

Three parallel implementations (Python, Go, TypeScript) of the same minimal
contract:

* `detect(pdfBytes) -> CvDetection` — zero-dependency byte scan that answers
  "is this PDF actually a `.cv`?". Returns the spec version, primary payload
  filename, primary language, and generator string from the embedded XMP
  packet, or signals that the input is plain PDF.
* `unwrap(pdfBytes, payloadName=None) -> UnwrappedPayload | None` — parses
  the PDF's `/AF` array and pulls one Associated File by name (defaults to
  the payload declared as primary in the XMP). Returns the raw bytes plus
  MIME type, ready to feed into a tokenizer.

## Why this exists

When a crawler (`GPTBot`, `ClaudeBot`, `Googlebot`, `PerplexityBot`, and the
RAG pipelines built on top of them) sees a `.cv` served as plain
`application/pdf`, the default code path is to OCR the visual layer. That
discards every benefit of the embedded clean text payload.

This module is the smallest possible patch over that default. Crawlers that
adopt it can ship `.cv`-aware behavior without taking on any of the cvfile
SDKs as runtime dependencies. The detect path needs no PDF parser at all;
the unwrap path uses the parser the host already trusts (pypdf in Python,
pdfcpu in Go, pdf-lib in TypeScript).

## Layout

```
tools/cv-detector/
├── python/        cvfile-cv-detector on PyPI
├── go/            github.com/cvfile/cv/tools/cv-detector/go
└── typescript/    @cvfile/cv-detector on npm
```

Every implementation is independently testable against the canonical fixture
at `packages/sdk-js/tests/fixtures/python-produced.cv`.

## API

| Field on `CvDetection` | Meaning |
| --- | --- |
| `isCvFile` | true when the PDF carries the cv XMP namespace |
| `version` | spec version declared in `cv:version` (e.g. `"1.0"`) |
| `primaryPayload` | filename of the canonical text payload (e.g. `"resume.md"`) |
| `primaryLanguage` | BCP-47 tag of the canonical content language |
| `generator` | producer identifier from `cv:generator` |

`unwrap()` returns `{ name, mimeType, bytes }` for the requested payload, or
null when the payload is absent.

## Licence

Apache-2.0. Vendor freely; port to other languages without asking. The whole
point is adoption.
