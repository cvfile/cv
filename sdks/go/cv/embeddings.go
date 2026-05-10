package cv

import (
	"encoding/binary"
	"fmt"
	"math"

	"github.com/fxamacker/cbor/v2"
)

// EmbeddingChunk mirrors the JS shape: a vector pinned to a span of the source markdown.
type EmbeddingChunk struct {
	ID         string    `json:"id"`
	TextOffset int       `json:"textOffset"`
	TextLength int       `json:"textLength"`
	Vector     []float32 `json:"-"`
}

// EmbeddingSpace is one model's worth of vectors.
type EmbeddingSpace struct {
	Model         string           `json:"model"`
	ModelRevision string           `json:"modelRevision"`
	Dimension     int              `json:"dimension"`
	Metric        string           `json:"metric"`
	Normalized    bool             `json:"normalized"`
	Chunking      string           `json:"chunking"`
	Chunks        []EmbeddingChunk `json:"chunks"`
}

// EmbeddingsPayload is the decoded form of embeddings.cbor.
type EmbeddingsPayload struct {
	FormatVersion int              `json:"formatVersion"`
	Spaces        []EmbeddingSpace `json:"spaces"`
}

// CBOR uses kebab-case keys per spec §5; keep an isolated DTO so tags match.
type cborChunk struct {
	ID         string `cbor:"id"`
	TextOffset int    `cbor:"text-offset"`
	TextLength int    `cbor:"text-length"`
	Vector     []byte `cbor:"vector"`
}

type cborSpace struct {
	Model         string      `cbor:"model"`
	ModelRevision string      `cbor:"model-revision"`
	Dimension     int         `cbor:"dimension"`
	Metric        string      `cbor:"metric"`
	Normalized    bool        `cbor:"normalized"`
	Chunking      string      `cbor:"chunking"`
	Chunks        []cborChunk `cbor:"chunks"`
}

type cborPayload struct {
	FormatVersion int         `cbor:"format-version"`
	Spaces        []cborSpace `cbor:"spaces"`
}

const currentEmbeddingsFormatVersion = 1

// DecodeEmbeddings parses the CBOR bytes that live in the embeddings.cbor
// payload and returns typed chunks with float32 vectors.
func DecodeEmbeddings(b []byte) (*EmbeddingsPayload, error) {
	var raw cborPayload
	if err := cbor.Unmarshal(b, &raw); err != nil {
		return nil, fmt.Errorf("decode embeddings cbor: %w", err)
	}
	if raw.FormatVersion > currentEmbeddingsFormatVersion {
		return nil, fmt.Errorf("unsupported embeddings format-version %d (this SDK supports up to %d)", raw.FormatVersion, currentEmbeddingsFormatVersion)
	}
	out := &EmbeddingsPayload{
		FormatVersion: raw.FormatVersion,
		Spaces:        make([]EmbeddingSpace, 0, len(raw.Spaces)),
	}
	for _, s := range raw.Spaces {
		if s.Dimension <= 0 {
			return nil, fmt.Errorf("space %q has invalid dimension %d", s.Model, s.Dimension)
		}
		chunks := make([]EmbeddingChunk, 0, len(s.Chunks))
		for _, c := range s.Chunks {
			vec, err := bytesToFloat32(c.Vector)
			if err != nil {
				return nil, fmt.Errorf("chunk %q: %w", c.ID, err)
			}
			if len(vec) != s.Dimension {
				return nil, fmt.Errorf("chunk %q vector length %d does not match space dimension %d", c.ID, len(vec), s.Dimension)
			}
			chunks = append(chunks, EmbeddingChunk{
				ID:         c.ID,
				TextOffset: c.TextOffset,
				TextLength: c.TextLength,
				Vector:     vec,
			})
		}
		out.Spaces = append(out.Spaces, EmbeddingSpace{
			Model:         s.Model,
			ModelRevision: s.ModelRevision,
			Dimension:     s.Dimension,
			Metric:        s.Metric,
			Normalized:    s.Normalized,
			Chunking:      s.Chunking,
			Chunks:        chunks,
		})
	}
	return out, nil
}

func bytesToFloat32(b []byte) ([]float32, error) {
	if len(b)%4 != 0 {
		return nil, fmt.Errorf("vector byte length %d is not a multiple of 4", len(b))
	}
	out := make([]float32, len(b)/4)
	for i := range out {
		out[i] = math.Float32frombits(binary.LittleEndian.Uint32(b[i*4 : i*4+4]))
	}
	return out, nil
}
