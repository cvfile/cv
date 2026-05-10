package cv

import (
	"os"
	"testing"
)

// TestSearchSemanticOnRealBGEM3 exercises the full path the cv search CLI
// takes: open a .cv with real BGE-M3 embeddings, decode, embed a query via
// the HF Inference API, rank chunks. Skips when fixture or HF_TOKEN is missing.
func TestSearchSemanticOnRealBGEM3(t *testing.T) {
	fixture := repoFixturePath("packages/embed-js/examples/out/jane-doe-with-bge-m3.cv")
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Skipf("fixture missing: build via `HF_TOKEN=… npx tsx packages/embed-js/examples/build-with-real-embeddings.ts`")
	}
	if os.Getenv("HF_TOKEN") == "" && os.Getenv("HUGGINGFACE_TOKEN") == "" {
		t.Skip("HF_TOKEN not set; skipping live search")
	}

	cborBytes, err := ExtractEmbeddings(data)
	if err != nil {
		t.Fatalf("ExtractEmbeddings: %v", err)
	}
	if len(cborBytes) == 0 {
		t.Fatal("fixture has no embeddings.cbor payload")
	}
	payload, err := DecodeEmbeddings(cborBytes)
	if err != nil {
		t.Fatalf("DecodeEmbeddings: %v", err)
	}
	if len(payload.Spaces) == 0 {
		t.Fatal("decoded payload has no spaces")
	}
	space := payload.Spaces[0]
	if space.Dimension != 1024 {
		t.Fatalf("expected 1024-dim BGE-M3, got %d", space.Dimension)
	}

	client, err := NewHuggingFaceClient(space.Model, "")
	if err != nil {
		t.Fatalf("NewHuggingFaceClient: %v", err)
	}

	cases := []struct {
		query        string
		expectTopOne []string // any of these is acceptable as #1
		expectAbove  string   // expectTopOne[0] should rank above this id
	}{
		{
			query:        "academic background and degrees",
			expectTopOne: []string{"education"},
			expectAbove:  "skills",
		},
		{
			query:        "programming languages and tools",
			expectTopOne: []string{"skills"},
			expectAbove:  "education",
		},
	}

	for _, tc := range cases {
		matrix, err := client.EmbedTexts([]string{tc.query})
		if err != nil {
			t.Fatalf("EmbedTexts(%q): %v", tc.query, err)
		}
		hits, err := SearchSemantic(payload, matrix[0], SearchOptions{K: len(space.Chunks)})
		if err != nil {
			t.Fatalf("SearchSemantic(%q): %v", tc.query, err)
		}
		topMatched := false
		for _, want := range tc.expectTopOne {
			if hits[0].ChunkID == want {
				topMatched = true
				break
			}
		}
		if !topMatched {
			t.Errorf("query %q: top hit was %q, expected one of %v", tc.query, hits[0].ChunkID, tc.expectTopOne)
		}

		// Directional: the expected hit should outrank the contrast id.
		var expected, contrast float64
		for _, h := range hits {
			if h.ChunkID == tc.expectTopOne[0] {
				expected = h.Score
			}
			if h.ChunkID == tc.expectAbove {
				contrast = h.Score
			}
		}
		if expected <= contrast {
			t.Errorf("query %q: %s score %.4f did not exceed %s score %.4f", tc.query, tc.expectTopOne[0], expected, tc.expectAbove, contrast)
		}
	}
}
