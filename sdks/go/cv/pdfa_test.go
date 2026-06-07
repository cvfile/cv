package cv

import (
	"os"
	"strings"
	"testing"
)

// packNonEmbeddedFont packs a PDF whose only font is the standard-14 Helvetica
// referenced by name with no embedded program (testdata/nonembedded-helvetica.pdf,
// produced by pdf-lib's embedFont(StandardFonts.Helvetica), mirroring the JS test).
// PDF/A-3u forbids non-embedded fonts, so the resulting .cv must fail the
// in-process strict check on pdfa3-font-not-embedded.
func packNonEmbeddedFont(t *testing.T) []byte {
	t.Helper()
	pdf, err := os.ReadFile("testdata/nonembedded-helvetica.pdf")
	if err != nil {
		t.Skipf("input PDF fixture missing at %s", "testdata/nonembedded-helvetica.pdf")
	}
	out, err := Pack(PackInput{
		PDF:      pdf,
		Markdown: []byte("# Jane Doe\n"),
		Metadata: Metadata{PrimaryLanguage: "en"},
	})
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}
	return out
}

func hasIssue(report *ValidationReport, code, level string) bool {
	for _, i := range report.Issues {
		if i.Code == code && i.Level == level {
			return true
		}
	}
	return false
}

func hasPdfaIssue(report *ValidationReport) bool {
	for _, i := range report.Issues {
		if strings.HasPrefix(i.Code, "pdfa3-") {
			return true
		}
	}
	return false
}

// TestPdfaStrictFailsOnNonEmbeddedFont mirrors the JS contract
// (packages/sdk-js/tests/pdfa.test.ts): a non-embedded font must FAIL cv-strict
// with conformance "failed" and a pdfa3-font-not-embedded error, never a false
// pass.
func TestPdfaStrictFailsOnNonEmbeddedFont(t *testing.T) {
	cv := packNonEmbeddedFont(t)
	report := Validate(cv, ValidateOptions{Strict: true})

	if report.OK {
		t.Error("expected OK=false for a non-embedded font under cv-strict")
	}
	if report.Conformance != ConformanceFailed {
		t.Errorf("Conformance = %q, want %q", report.Conformance, ConformanceFailed)
	}
	if !hasIssue(report, "pdfa3-font-not-embedded", "error") {
		t.Errorf("expected a pdfa3-font-not-embedded error; got %+v", report.Issues)
	}
}

// TestPdfaLenientSkipsCheck asserts cv-lenient neither runs the PDF/A check nor
// falsely fails: no pdfa3-* issue, Conformance left empty (omitted).
func TestPdfaLenientSkipsCheck(t *testing.T) {
	cv := packNonEmbeddedFont(t)
	report := Validate(cv, ValidateOptions{Strict: false})

	if !report.OK {
		t.Errorf("expected OK=true under cv-lenient; got issues %+v", report.Issues)
	}
	if report.Conformance != "" {
		t.Errorf("Conformance = %q, want empty (omitted) under cv-lenient", report.Conformance)
	}
	if hasPdfaIssue(report) {
		t.Errorf("cv-lenient should emit no pdfa3-* issue; got %+v", report.Issues)
	}
}

// TestPdfaStrictStructuralPassOnConformant asserts a conformant file (embedded
// fonts) reports structural-pass, with the honest pdfa3-structural-pass warning
// surfaced rather than swallowed. python-produced.cv is the cross-SDK conformant
// fixture used by the JS test.
func TestPdfaStrictStructuralPassOnConformant(t *testing.T) {
	data, err := os.ReadFile(repoFixturePath("packages/sdk-js/tests/fixtures/python-produced.cv"))
	if err != nil {
		t.Skipf("conformant fixture missing at %s", "packages/sdk-js/tests/fixtures/python-produced.cv")
	}
	report := Validate(data, ValidateOptions{Strict: true})

	if !report.OK {
		t.Errorf("expected OK=true for a conformant file; got %+v", report.Issues)
	}
	if report.Conformance != ConformanceStructuralPass {
		t.Errorf("Conformance = %q, want %q", report.Conformance, ConformanceStructuralPass)
	}
	if !hasIssue(report, "pdfa3-structural-pass", "warning") {
		t.Errorf("expected the pdfa3-structural-pass warning; got %+v", report.Issues)
	}
}

// TestReadXMPValue covers both XMP marker forms (attribute and element) plus the
// absent case, matching the JS readXmpValue helper.
func TestReadXMPValue(t *testing.T) {
	attr := `<rdf:Description pdfaid:part="3" pdfaid:conformance="U"/>`
	if v, ok := readXMPValue(attr, "pdfaid:part"); !ok || v != "3" {
		t.Errorf("attribute part = (%q, %t), want (\"3\", true)", v, ok)
	}
	if v, ok := readXMPValue(attr, "pdfaid:conformance"); !ok || v != "U" {
		t.Errorf("attribute conformance = (%q, %t), want (\"U\", true)", v, ok)
	}

	elem := `<pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance>`
	if v, ok := readXMPValue(elem, "pdfaid:part"); !ok || v != "3" {
		t.Errorf("element part = (%q, %t), want (\"3\", true)", v, ok)
	}
	if v, ok := readXMPValue(elem, "pdfaid:conformance"); !ok || v != "B" {
		t.Errorf("element conformance = (%q, %t), want (\"B\", true)", v, ok)
	}

	if _, ok := readXMPValue(`<x/>`, "pdfaid:part"); ok {
		t.Error("expected absent marker to report ok=false")
	}
}
