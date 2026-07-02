package cv

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"testing"
)

type validFixture struct {
	Filename        string   `json:"filename"`
	Expected        string   `json:"expected"`
	ExpectedCode    string   `json:"expectedCode"`
	Description     string   `json:"description"`
	PrimaryPayload  string   `json:"primaryPayload"`
	PrimaryLanguage string   `json:"primaryLanguage"`
	PayloadNames    []string `json:"payloadNames"`
}

type validManifest struct {
	Fixtures []validFixture `json:"fixtures"`
}

func loadValidManifest(t *testing.T) (string, *validManifest) {
	t.Helper()
	manifestPath := repoFixturePath("spec/test-vectors/valid/manifest.json")
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Skipf("valid-corpus manifest missing at %s; build via packages/sdk-js/tools/build-valid.ts", manifestPath)
	}
	var manifest validManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatalf("parse manifest: %v", err)
	}
	if len(manifest.Fixtures) == 0 {
		t.Fatal("manifest has no fixtures")
	}
	return filepath.Dir(manifestPath), &manifest
}

func TestValidVectorCorpus(t *testing.T) {
	dir, manifest := loadValidManifest(t)

	for _, f := range manifest.Fixtures {
		f := f
		t.Run(f.Filename, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(dir, f.Filename))
			if err != nil {
				t.Skipf("fixture missing: %v", err)
			}

			report := Validate(data, ValidateOptions{})
			codes := make([]string, 0, len(report.Issues))
			for _, i := range report.Issues {
				codes = append(codes, i.Code)
			}

			if f.Expected == "error" {
				if report.OK {
					t.Fatalf("%s should fail (%s); got 0 errors", f.Filename, f.Description)
				}
				found := false
				for _, i := range report.Issues {
					if i.Code == f.ExpectedCode {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("%s expected code %q, got %v", f.Filename, f.ExpectedCode, codes)
				}
				return
			}

			if !report.OK {
				t.Fatalf("%s should pass (%s); got issues %v", f.Filename, f.Description, codes)
			}
			if f.Expected == "warning" {
				found := false
				for _, i := range report.Issues {
					if i.Code == f.ExpectedCode && i.Level == "warning" {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("%s expected warning %q, got %v", f.Filename, f.ExpectedCode, codes)
				}
			}

			// Both "valid" and "warning" fixtures must extract losslessly:
			// spec §8.3 forbids dropping payloads even for a newer MAJOR.
			file, err := Extract(data)
			if err != nil {
				t.Fatalf("Extract(%s): %v", f.Filename, err)
			}
			if file.Metadata.PrimaryPayload != f.PrimaryPayload {
				t.Errorf("primaryPayload = %q, want %q", file.Metadata.PrimaryPayload, f.PrimaryPayload)
			}
			if file.Metadata.PrimaryLanguage != f.PrimaryLanguage {
				t.Errorf("primaryLanguage = %q, want %q", file.Metadata.PrimaryLanguage, f.PrimaryLanguage)
			}
			got := make([]string, 0, len(file.Payloads))
			var primaryLen int
			for _, p := range file.Payloads {
				got = append(got, p.Name)
				if p.Name == f.PrimaryPayload {
					primaryLen = len(p.Bytes)
				}
			}
			want := append([]string(nil), f.PayloadNames...)
			sort.Strings(got)
			sort.Strings(want)
			if len(got) != len(want) {
				t.Fatalf("payload names = %v, want %v", got, want)
			}
			for i := range got {
				if got[i] != want[i] {
					t.Fatalf("payload names = %v, want %v", got, want)
				}
			}
			if primaryLen == 0 {
				t.Errorf("primary payload %q extracted empty", f.PrimaryPayload)
			}
		})
	}
}

// TestExtractOversizedVectorRefusedByDefault pins the extraction contract on
// the oversized vector: Extract applies the DefaultMaxPayloadBytes cap and
// refuses the file with a *PayloadTooLargeError (matching the JS
// maxPayloadBytes abort and the Python PayloadTooLargeError). Opting out via
// NoPayloadLimit must return the payload in full; silent truncation is never
// allowed (spec §7.3).
func TestExtractOversizedVectorRefusedByDefault(t *testing.T) {
	_, manifest := loadValidManifest(t)
	var entry *validFixture
	for i := range manifest.Fixtures {
		if manifest.Fixtures[i].ExpectedCode == "payload-too-large" {
			entry = &manifest.Fixtures[i]
			break
		}
	}
	if entry == nil {
		t.Fatal("manifest lost its payload-too-large vector")
	}
	data, err := os.ReadFile(repoFixturePath("spec/test-vectors/valid/" + entry.Filename))
	if err != nil {
		t.Skipf("fixture missing: %v", err)
	}

	_, err = Extract(data)
	var tooLarge *PayloadTooLargeError
	if !errors.As(err, &tooLarge) {
		t.Fatalf("Extract(%s) = %v, want *PayloadTooLargeError", entry.Filename, err)
	}
	if tooLarge.Limit != DefaultMaxPayloadBytes {
		t.Errorf("cap = %d, want default %d", tooLarge.Limit, DefaultMaxPayloadBytes)
	}
	if tooLarge.Size <= DefaultMaxPayloadBytes {
		t.Errorf("reported size %d does not exceed the %d-byte cap", tooLarge.Size, DefaultMaxPayloadBytes)
	}

	file, err := ExtractWithOptions(data, ExtractOptions{NoPayloadLimit: true})
	if err != nil {
		t.Fatalf("ExtractWithOptions(NoPayloadLimit): %v", err)
	}
	for _, p := range file.Payloads {
		if p.Name == "resume.md" && len(p.Bytes) <= DefaultMaxPayloadBytes {
			t.Errorf("resume.md extracted as %d bytes with the cap disabled; payload was silently truncated below the %d-byte cap",
				len(p.Bytes), DefaultMaxPayloadBytes)
		}
	}
}
