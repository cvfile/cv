package cv

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
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
