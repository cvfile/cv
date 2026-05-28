package cv

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

const sampleMD = `# Jane Doe

Senior software engineer.

## Experience

- ACME Corp 2022 to 2026
- Initech 2018 to 2022
`

const sampleHTML = `<!doctype html>
<html lang="en"><body><h1>Jane Doe</h1></body></html>`

// minimalPDF is a minimal hand-built PDF used to confirm the reader rejects
// plain PDFs as .cv and that Pack refuses minimal input without panicking.
var minimalPDF = []byte("%PDF-1.7\n" +
	"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
	"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
	"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<<>>/ProcSet[/PDF/Text]>>>>endobj\n" +
	"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000054 00000 n \n0000000099 00000 n \n" +
	"trailer<</Size 4/Root 1 0 R>>\nstartxref\n195\n%%EOF\n")

// Go-side Pack() (the writer) is deferred to v0.2: v0.1 of cv-go ships as a
// consumer SDK. The reader path through pdfcpu is solid, and "Go can read .cv
// files produced by any compliant SDK" is exercised by the interop tests below.
// Pack() must refuse up front so it can never emit a corrupt file or panic.

func TestIsCvFileRejectsPlainPDF(t *testing.T) {
	if IsCvFile(minimalPDF) {
		t.Error("plain PDF should not be detected as .cv")
	}
}

// TestPackReturnsNotImplementedForNormalPDF asserts Pack refuses a normal input
// PDF with ErrPackNotImplemented instead of emitting a corrupt .cv file.
func TestPackReturnsNotImplementedForNormalPDF(t *testing.T) {
	pdf, err := os.ReadFile(repoFixturePath("packages/sdk-js/examples/out/jane-doe.pdf"))
	if err != nil {
		t.Skipf("input PDF fixture missing at %s", "packages/sdk-js/examples/out/jane-doe.pdf")
	}
	out, err := Pack(PackInput{
		PDF:      pdf,
		Markdown: []byte(sampleMD),
		HTML:     []byte(sampleHTML),
		Metadata: Metadata{PrimaryLanguage: "en"},
	})
	if !errors.Is(err, ErrPackNotImplemented) {
		t.Fatalf("Pack err = %v, want ErrPackNotImplemented", err)
	}
	if out != nil {
		t.Errorf("Pack returned %d bytes; want nil (no corrupt file)", len(out))
	}
}

// TestPackDoesNotPanicOnMinimalPDF asserts Pack returns the not-implemented
// error rather than panicking on a minimal PDF (the old writer path panicked
// with "assignment to entry in nil map").
func TestPackDoesNotPanicOnMinimalPDF(t *testing.T) {
	out, err := Pack(PackInput{
		PDF:      minimalPDF,
		Markdown: []byte(sampleMD),
		Metadata: Metadata{PrimaryLanguage: "en"},
	})
	if !errors.Is(err, ErrPackNotImplemented) {
		t.Fatalf("Pack err = %v, want ErrPackNotImplemented", err)
	}
	if out != nil {
		t.Errorf("Pack returned %d bytes; want nil", len(out))
	}
}

func TestInteropReadsJSProducedFile(t *testing.T) {
	fixture := repoFixturePath("packages/sdk-js/examples/out/jane-doe.cv")
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Skipf("JS fixture missing at %s; build with `pnpm --filter @cvfile/sdk` then `npx tsx examples/build-jane-doe.ts`", fixture)
	}
	if !IsCvFile(data) {
		t.Fatal("Go did not detect JS-produced file as .cv")
	}
	meta, err := Inspect(data)
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if meta.Version != SpecVersion {
		t.Errorf("Version = %q, want %q", meta.Version, SpecVersion)
	}
	if !strings.Contains(meta.Generator, "cv-examples") {
		t.Errorf("generator = %q, want it to contain 'cv-examples'", meta.Generator)
	}

	mdSrc, err := os.ReadFile(repoFixturePath("packages/sdk-js/examples/jane-doe.md"))
	if err != nil {
		t.Fatalf("read js md source: %v", err)
	}
	got, err := ExtractMarkdown(data, "")
	if err != nil {
		t.Fatalf("ExtractMarkdown: %v", err)
	}
	if got != string(mdSrc) {
		t.Errorf("markdown round-trip differs (len got=%d want=%d)", len(got), len(mdSrc))
	}
}

func TestInteropReadsPythonProducedFile(t *testing.T) {
	fixture := repoFixturePath("packages/sdk-js/tests/fixtures/python-produced.cv")
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Skipf("Python fixture missing at %s; run `python sdks/python/examples/build_python_sample.py`", fixture)
	}
	if !IsCvFile(data) {
		t.Fatal("Go did not detect Python-produced file as .cv")
	}
	file, err := Extract(data)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	got := make(map[string]bool)
	for _, p := range file.Payloads {
		got[p.Name] = true
	}
	for _, want := range []string{"resume.md", "resume.html", "resume.json"} {
		if !got[want] {
			t.Errorf("Python-produced .cv missing %q payload", want)
		}
	}
}

func repoFixturePath(rel string) string {
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
	return filepath.Join(repoRoot, rel)
}
