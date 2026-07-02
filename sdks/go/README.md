# cv-go

Reference Go SDK for the [`.cv`](https://cvfile.org) open file format. Read and write `.cv` files from Go programs and from the canonical `cv` CLI.

## Install

```bash
go get github.com/cvfile/cv/sdks/go
```

## Pack

```go
package main

import (
    "os"

    cv "github.com/cvfile/cv/sdks/go/cv"
)

func main() {
    pdf, _ := os.ReadFile("resume.pdf")
    md, _ := os.ReadFile("resume.md")

    out, err := cv.Pack(cv.PackInput{
        PDF:      pdf,
        Markdown: md,
        Metadata: cv.Metadata{
            PrimaryLanguage: "en",
        },
    })
    if err != nil {
        panic(err)
    }
    _ = os.WriteFile("resume.cv", out, 0o644)
}
```

## Extract

```go
file, err := cv.Extract(cvBytes)
md, _ := cv.ExtractMarkdown(cvBytes, "")
```

## CLI

```bash
go install github.com/cvfile/cv/sdks/go/cmd/cv@latest

cv pack    --pdf resume.pdf --md resume.md -o resume.cv
cv extract resume.cv --format md
cv inspect resume.cv
```

### Extract safety

`cv extract` validates the file before writing anything. When the file fails
validation (for example it carries a JavaScript action forbidden by spec
section 3.4, which a verbatim `--format pdf` passthrough would otherwise
propagate), the CLI prints a one line warning to stderr and still emits the
payload on stdout, so piping keeps working. Pass `--require-valid` to refuse
extraction from an invalid file (exit code 65) instead of warning.

Payload extraction is also capped at 16 MiB decompressed per payload
(spec section 7.3), so a hostile file cannot inflate a few compressed
kilobytes into an arbitrarily large output. In the SDK the cap defaults to
`cv.DefaultMaxPayloadBytes`; raise it or opt out per call with
`cv.ExtractWithOptions` (`MaxPayloadBytes`, or `NoPayloadLimit` for trusted
inputs). pdfcpu inflates streams in one shot, so the cap is enforced
immediately after decoding, before the payload is retained or returned; an
oversized payload fails the extraction with `*cv.PayloadTooLargeError` rather
than being silently truncated.

## License

Apache-2.0.
