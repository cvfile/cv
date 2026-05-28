package cv

import "errors"

// ErrPackNotImplemented is returned by Pack in the Go SDK v0.1. The Go SDK
// ships as a reader (extract / inspect / validate / search); the writer that
// embeds /AF payloads and the cv: XMP packet without corrupting the PDF page
// tree is planned for v0.2 (see ROADMAP Phase 1.7-1.8). Refusing up front is
// the honest behaviour: the previous pdfcpu WriteContext path silently dropped
// the newly added indirect objects, producing files that failed their own
// validator, and panicked on minimal input PDFs.
var ErrPackNotImplemented = errors.New(
	"cv: Pack (writer) is not implemented in the Go SDK v0.1; use the JS or Python SDK to create .cv files (Go writer is planned for v0.2)",
)

// Pack builds a .cv file from the input PDF and one or more representations.
//
// Not implemented in the Go SDK v0.1: this always returns ErrPackNotImplemented
// without mutating any PDF, so it can never emit a corrupt file or panic. The
// signature is kept stable for the v0.2 writer.
func Pack(in PackInput) ([]byte, error) {
	return nil, ErrPackNotImplemented
}
