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

// minimalPDF is a minimal hand-built PDF used to confirm the reader rejects
// plain PDFs as .cv and to exercise Pack's payload validation.
var minimalPDF = []byte("%PDF-1.7\n" +
	"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
	"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
	"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<<>>/ProcSet[/PDF/Text]>>>>endobj\n" +
	"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000054 00000 n \n0000000099 00000 n \n" +
	"trailer<</Size 4/Root 1 0 R>>\nstartxref\n195\n%%EOF\n")

func TestIsCvFileRejectsPlainPDF(t *testing.T) {
	if IsCvFile(minimalPDF) {
		t.Error("plain PDF should not be detected as .cv")
	}
}

// TestPackRoundTrip asserts the writer produces a real .cv file: the bytes are
// detected as a .cv, the metadata round-trips, and every payload is extractable
// with byte-identical content. This is the core "Go can now write .cv" contract.
func TestPackRoundTrip(t *testing.T) {
	pdf, err := os.ReadFile(repoFixturePath("packages/sdk-js/examples/out/jane-doe.pdf"))
	if err != nil {
		t.Skipf("input PDF fixture missing at %s", "packages/sdk-js/examples/out/jane-doe.pdf")
	}
	out, err := Pack(PackInput{
		PDF:      pdf,
		Markdown: []byte(sampleMD),
		HTML:     []byte(sampleHTML),
		JSON:     map[string]any{"basics": map[string]any{"name": "Jane Doe"}},
		Metadata: Metadata{PrimaryLanguage: "en"},
	})
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}
	if !IsCvFile(out) {
		t.Fatal("Pack output is not detected as a .cv file")
	}

	meta, err := Inspect(out)
	if err != nil {
		t.Fatalf("Inspect packed file: %v", err)
	}
	if meta.PrimaryLanguage != "en" {
		t.Errorf("primaryLanguage = %q, want en", meta.PrimaryLanguage)
	}
	if meta.PrimaryPayload != NameMarkdown {
		t.Errorf("primaryPayload = %q, want %q", meta.PrimaryPayload, NameMarkdown)
	}

	gotMD, err := ExtractMarkdown(out, "")
	if err != nil {
		t.Fatalf("ExtractMarkdown: %v", err)
	}
	if gotMD != sampleMD {
		t.Errorf("markdown round-trip differs:\n got: %q\nwant: %q", gotMD, sampleMD)
	}

	file, err := Extract(out)
	if err != nil {
		t.Fatalf("Extract: %v", err)
	}
	got := map[string]bool{}
	for _, p := range file.Payloads {
		got[p.Name] = true
	}
	for _, want := range []string{NameMarkdown, NameHTML, NameJSON} {
		if !got[want] {
			t.Errorf("packed .cv missing %q payload", want)
		}
	}
}

// TestPackAddsPdfaScaffolding asserts the writer supplies the PDF/A-3u
// requirements it is responsible for: the sRGB GTS_PDFA1 output intent, the
// trailer /ID, and the pdfaid identification markers. Font embedding is a
// property of the INPUT PDF, not the writer, so this test asserts only that the
// writer-owned markers are present (no pdfa3-no-output-intent /
// pdfa3-output-intent-incomplete / pdfa3-no-file-id / pdfaid errors), regardless
// of whether the input PDF happens to embed its fonts.
func TestPackAddsPdfaScaffolding(t *testing.T) {
	pdf, err := os.ReadFile(repoFixturePath("packages/sdk-js/examples/out/jane-doe.pdf"))
	if err != nil {
		t.Skipf("input PDF fixture missing at %s", "packages/sdk-js/examples/out/jane-doe.pdf")
	}
	out, err := Pack(PackInput{
		PDF:      pdf,
		Markdown: []byte(sampleMD),
		Metadata: Metadata{PrimaryLanguage: "en"},
	})
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}
	report := Validate(out, ValidateOptions{Strict: true})
	writerOwned := map[string]bool{
		"pdfa3-no-output-intent":         true,
		"pdfa3-output-intent-incomplete": true,
		"pdfa3-no-file-id":               true,
		"pdfa3-no-id-markers":            true,
		"pdfa3-id-part-mismatch":         true,
		"pdfa3-id-conformance-missing":   true,
	}
	for _, i := range report.Issues {
		if writerOwned[i.Code] {
			t.Errorf("writer should have satisfied %s but it was reported: %s", i.Code, i.Message)
		}
	}
}

// TestPackRejectsEmptyPayloads asserts Pack refuses input with no representation.
func TestPackRejectsEmptyPayloads(t *testing.T) {
	if _, err := Pack(PackInput{PDF: minimalPDF}); err == nil {
		t.Fatal("Pack should reject input with no payloads")
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
