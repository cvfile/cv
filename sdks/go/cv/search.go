package cv

import (
	"fmt"
	"math"
	"sort"
)

// SearchHit is one ranked result from SearchSemantic.
type SearchHit struct {
	SpaceModel string  `json:"spaceModel"`
	ChunkID    string  `json:"chunkId"`
	TextOffset int     `json:"textOffset"`
	TextLength int     `json:"textLength"`
	Score      float64 `json:"score"`
}

// SearchOptions tunes which space is queried and how many hits are returned.
type SearchOptions struct {
	// Model restricts to a specific embedding space; empty = first space.
	Model string
	// K is the number of hits to return; <=0 defaults to 5.
	K int
}

// SearchSemantic ranks the chunks of an embedding space against the query
// vector. Cosine and dot are descending; euclidean is ascending.
func SearchSemantic(payload *EmbeddingsPayload, queryVector []float32, opts SearchOptions) ([]SearchHit, error) {
	if payload == nil || len(payload.Spaces) == 0 {
		return nil, fmt.Errorf("no embedding spaces in payload")
	}
	space := pickSearchSpace(payload, opts.Model)
	if space == nil {
		return nil, fmt.Errorf("no embedding space matches model %q", opts.Model)
	}
	if len(queryVector) != space.Dimension {
		return nil, fmt.Errorf("query vector dimension %d does not match space %s dimension %d", len(queryVector), space.Model, space.Dimension)
	}
	k := opts.K
	if k <= 0 {
		k = 5
	}

	hits := make([]SearchHit, 0, len(space.Chunks))
	for _, c := range space.Chunks {
		hits = append(hits, SearchHit{
			SpaceModel: space.Model,
			ChunkID:    c.ID,
			TextOffset: c.TextOffset,
			TextLength: c.TextLength,
			Score:      similarity(queryVector, c.Vector, space.Metric),
		})
	}

	if space.Metric == "euclidean" {
		sort.Slice(hits, func(i, j int) bool { return hits[i].Score < hits[j].Score })
	} else {
		sort.Slice(hits, func(i, j int) bool { return hits[i].Score > hits[j].Score })
	}
	if k < len(hits) {
		hits = hits[:k]
	}
	return hits, nil
}

func pickSearchSpace(payload *EmbeddingsPayload, model string) *EmbeddingSpace {
	if model == "" {
		return &payload.Spaces[0]
	}
	for i := range payload.Spaces {
		if payload.Spaces[i].Model == model {
			return &payload.Spaces[i]
		}
	}
	return nil
}

func similarity(a, b []float32, metric string) float64 {
	if metric == "euclidean" {
		var sum float64
		for i := range a {
			d := float64(a[i]) - float64(b[i])
			sum += d * d
		}
		return math.Sqrt(sum)
	}
	var dot, na, nb float64
	for i := range a {
		fa, fb := float64(a[i]), float64(b[i])
		dot += fa * fb
		na += fa * fa
		nb += fb * fb
	}
	if metric == "dot" {
		return dot
	}
	denom := math.Sqrt(na) * math.Sqrt(nb)
	if denom == 0 {
		return 0
	}
	return dot / denom
}
