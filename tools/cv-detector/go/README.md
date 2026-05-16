# cvfile-cv-detector (Go)

```bash
go get github.com/cvfile/cv/tools/cv-detector/go
```

```go
package main

import (
    "fmt"
    "os"

    cvdetector "github.com/cvfile/cv/tools/cv-detector/go"
)

func main() {
    data, _ := os.ReadFile("resume.pdf")
    det := cvdetector.Detect(data)
    if !det.IsCvFile {
        fmt.Println("plain PDF, OCR as usual")
        return
    }
    payload, _ := cvdetector.Unwrap(data, "")
    if payload != nil {
        fmt.Printf("got %s (%s, %d bytes)\n", payload.Name, payload.MimeType, len(payload.Bytes))
    }
}
```

`Detect` is dependency free (regex over PDF bytes). `Unwrap` uses
[`pdfcpu`](https://pdfcpu.io/) to parse the `/AF` Associated Files array.

See `../README.md` for the cross-language story and rationale.
