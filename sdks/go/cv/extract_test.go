package cv

import (
	"errors"
	"os"
	"testing"
)

// TestExtractPayloadCap exercises the decompressed-size cap on the extract
// path: a cap below the payload size rejects with *PayloadTooLargeError, an
// explicit higher cap accepts the same file in full, and the zero value keeps
// the DefaultMaxPayloadBytes cap (so small files pass untouched).
func TestExtractPayloadCap(t *testing.T) {
	pdf, err := os.ReadFile(repoFixturePath("packages/sdk-js/examples/out/jane-doe.pdf"))
	if err != nil {
		t.Skipf("input PDF fixture missing at %s", "packages/sdk-js/examples/out/jane-doe.pdf")
	}
	data, err := Pack(PackInput{PDF: pdf, Markdown: []byte(sampleMD)})
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}

	t.Run("cap below payload size rejects", func(t *testing.T) {
		_, err := ExtractWithOptions(data, ExtractOptions{MaxPayloadBytes: 4})
		var tooLarge *PayloadTooLargeError
		if !errors.As(err, &tooLarge) {
			t.Fatalf("ExtractWithOptions(cap=4) = %v, want *PayloadTooLargeError", err)
		}
		if tooLarge.Limit != 4 {
			t.Errorf("Limit = %d, want 4", tooLarge.Limit)
		}
		if tooLarge.Size <= 4 {
			t.Errorf("Size = %d, want > 4", tooLarge.Size)
		}
		if tooLarge.Payload != NameMarkdown {
			t.Errorf("Payload = %q, want %q", tooLarge.Payload, NameMarkdown)
		}
	})

	t.Run("explicit higher cap accepts in full", func(t *testing.T) {
		file, err := ExtractWithOptions(data, ExtractOptions{MaxPayloadBytes: len(sampleMD)})
		if err != nil {
			t.Fatalf("ExtractWithOptions(cap=%d): %v", len(sampleMD), err)
		}
		assertFullMarkdown(t, file)
	})

	t.Run("zero cap means default", func(t *testing.T) {
		file, err := ExtractWithOptions(data, ExtractOptions{})
		if err != nil {
			t.Fatalf("ExtractWithOptions(default): %v", err)
		}
		assertFullMarkdown(t, file)
	})
}

func assertFullMarkdown(t *testing.T, file *File) {
	t.Helper()
	for _, p := range file.Payloads {
		if p.Name == NameMarkdown {
			if string(p.Bytes) != sampleMD {
				t.Errorf("markdown payload = %d bytes, want the full %d-byte original", len(p.Bytes), len(sampleMD))
			}
			return
		}
	}
	t.Errorf("markdown payload %q missing from extraction", NameMarkdown)
}
