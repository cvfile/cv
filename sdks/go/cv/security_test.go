package cv

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

type maliciousFixture struct {
	Filename     string `json:"filename"`
	ExpectedCode string `json:"expectedCode"`
	Description  string `json:"description"`
}

type maliciousManifest struct {
	Fixtures []maliciousFixture `json:"fixtures"`
}

func TestSecurityRejectsMaliciousFixtures(t *testing.T) {
	manifestPath := repoFixturePath("spec/test-vectors/malicious/manifest.json")
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Skipf("malicious-corpus manifest missing at %s; build via packages/sdk-js/tools/build-malicious.ts", manifestPath)
	}
	var manifest maliciousManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatalf("parse manifest: %v", err)
	}
	if len(manifest.Fixtures) == 0 {
		t.Fatal("manifest has no fixtures")
	}

	for _, f := range manifest.Fixtures {
		f := f
		t.Run(f.Filename, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(filepath.Dir(manifestPath), f.Filename))
			if err != nil {
				t.Skipf("fixture missing: %v", err)
			}
			report := Validate(data, ValidateOptions{})
			if report.OK {
				t.Fatalf("%s should fail (%s); got 0 errors", f.Filename, f.Description)
			}
			found := false
			codes := make([]string, 0, len(report.Issues))
			for _, i := range report.Issues {
				codes = append(codes, i.Code)
				if i.Code == f.ExpectedCode {
					found = true
				}
			}
			if !found {
				t.Errorf("%s expected code %q, got %v", f.Filename, f.ExpectedCode, codes)
			}
		})
	}
}

// mustLoadInlineJSContext returns a context for a PDF that carries a forbidden
// JavaScript action as a DIRECT (inline) child of the catalog's /OpenAction.
// The old xref-only scan never looked inside inline dicts, so this slipped
// through; the graph walk catches it.
func mustLoadInlineJSContext(t *testing.T) *model.Context {
	t.Helper()
	pdf := []byte("%PDF-1.7\n" +
		"1 0 obj<</Type/Catalog/Pages 2 0 R/OpenAction<</S/JavaScript/JS(app.alert\\(1\\))>>>>endobj\n" +
		"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
		"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Resources<</Font<<>>/ProcSet[/PDF/Text]>>>>endobj\n" +
		"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000089 00000 n \n0000000134 00000 n \n" +
		"trailer<</Size 4/Root 1 0 R>>\nstartxref\n229\n%%EOF\n")
	ctx, err := loadContext(pdf)
	if err != nil {
		t.Fatalf("loadContext: %v", err)
	}
	return ctx
}

// TestSecurityCatchesInlineOpenActionJS asserts that a JavaScript action stored
// as a DIRECT (inline) catalog /OpenAction is rejected with javascript-action.
func TestSecurityCatchesInlineOpenActionJS(t *testing.T) {
	ctx := mustLoadInlineJSContext(t)
	issues := scanForbiddenConstructs(ctx)
	found := false
	codes := make([]string, 0, len(issues))
	for _, i := range issues {
		codes = append(codes, i.Code)
		if i.Code == "javascript-action" {
			found = true
		}
	}
	if !found {
		t.Errorf("inline /OpenAction JavaScript not rejected; got codes %v", codes)
	}
}

func TestSecurityPayloadSizeCap(t *testing.T) {
	fixture := repoFixturePath("packages/sdk-js/examples/out/jane-doe.cv")
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Skipf("base fixture missing at %s", fixture)
	}

	pass := Validate(data, ValidateOptions{})
	if !pass.OK {
		t.Fatalf("base file should pass default validation: %v", pass.Issues)
	}

	tight := Validate(data, ValidateOptions{MaxPayloadBytes: 256})
	if tight.OK {
		t.Fatal("validation should fail with 256-byte cap")
	}
	got := false
	for _, i := range tight.Issues {
		if i.Code == "payload-too-large" {
			got = true
			break
		}
	}
	if !got {
		t.Errorf("expected payload-too-large; got %+v", tight.Issues)
	}
}
