package cv

import (
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

// minimalPDF is a minimal PDF with /Resources containing /Font and
// /ProcSet so that pdfcpu's writePagesDict has writable maps to populate.
// Built by hand once for tests; unused fields trimmed to the minimum.
var minimalPDF = []byte("%PDF-1.7\n" +
	"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
	"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
	"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<<>>/ProcSet[/PDF/Text]>>>>endobj\n" +
	"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000054 00000 n \n0000000099 00000 n \n" +
	"trailer<</Size 4/Root 1 0 R>>\nstartxref\n195\n%%EOF\n")

// Go-side Pack() depends on pdfcpu's writer, which currently chokes on
// some minimal input PDFs (nil-map panic in writePagesDict). The reader
// path through pdfcpu is solid, so v0.1 of cv-go ships as a consumer
// SDK. Pack() round-trip tests will return when the writer issue is
// resolved (likely by fronting pdfcpu with a hand-rolled incremental
// updater that appends /AF + /Metadata without touching the page tree).
//
// In the meantime, the killer property for Go adopters — "Go can read
// .cv files produced by any compliant SDK" — is exercised by the
// interop tests below.

func TestIsCvFileRejectsPlainPDF(t *testing.T) {
	if IsCvFile(minimalPDF) {
		t.Error("plain PDF should not be detected as .cv")
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
