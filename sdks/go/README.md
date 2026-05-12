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

## License

Apache-2.0.
