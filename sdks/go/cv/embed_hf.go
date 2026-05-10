package cv

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"time"
)

// HuggingFaceClient calls the HF serverless Inference API for feature
// extraction. It mirrors the JS createHuggingFaceBackend so cv search
// produces vectors in the same space the file was originally embedded in.
type HuggingFaceClient struct {
	Model   string
	Token   string
	BaseURL string
	HTTP    *http.Client
}

const defaultHFBaseURL = "https://router.huggingface.co/hf-inference/models"

// NewHuggingFaceClient pulls the token from the constructor or HF_TOKEN /
// HUGGINGFACE_TOKEN env vars. Defaults to the production base URL.
func NewHuggingFaceClient(model, token string) (*HuggingFaceClient, error) {
	if token == "" {
		token = os.Getenv("HF_TOKEN")
	}
	if token == "" {
		token = os.Getenv("HUGGINGFACE_TOKEN")
	}
	if token == "" {
		return nil, fmt.Errorf("HF_TOKEN (or HUGGINGFACE_TOKEN) is required")
	}
	if model == "" {
		return nil, fmt.Errorf("model is required")
	}
	return &HuggingFaceClient{
		Model:   model,
		Token:   token,
		BaseURL: defaultHFBaseURL,
		HTTP:    &http.Client{Timeout: 120 * time.Second},
	}, nil
}

// EmbedTexts returns one mean-pooled, L2-normalised vector per input text.
func (c *HuggingFaceClient) EmbedTexts(texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	body, err := json.Marshal(map[string]any{
		"inputs":  texts,
		"options": map[string]bool{"wait_for_model": true},
	})
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf("%s/%s/pipeline/feature-extraction", c.BaseURL, url.PathEscape(c.Model))
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("authorization", "Bearer "+c.Token)

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		snippet := string(raw)
		if len(snippet) > 300 {
			snippet = snippet[:300]
		}
		return nil, fmt.Errorf("HF Inference API %d for %s: %s", res.StatusCode, c.Model, snippet)
	}

	matrix, err := parseHFMatrix(raw, len(texts))
	if err != nil {
		return nil, err
	}
	for i := range matrix {
		matrix[i] = normalize(matrix[i])
	}
	return matrix, nil
}

// parseHFMatrix coerces the variety of HF response shapes into [][]float32.
// sentence-transformers models (BGE-M3, MiniLM) return [[...]]; raw token
// embeddings come back as [[[...]]] which we mean-pool per input.
func parseHFMatrix(raw []byte, expected int) ([][]float32, error) {
	var top any
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, fmt.Errorf("HF response not JSON: %w", err)
	}
	arr, ok := top.([]any)
	if !ok {
		return nil, fmt.Errorf("HF response: expected array, got %T", top)
	}
	if len(arr) == 0 {
		return nil, nil
	}

	switch first := arr[0].(type) {
	case float64:
		// Single input, vector returned flat.
		if expected != 1 {
			return nil, fmt.Errorf("HF returned 1 vector, expected %d", expected)
		}
		return [][]float32{toFloat32(arr)}, nil
	case []any:
		if len(first) == 0 {
			return [][]float32{{}}, nil
		}
		switch first[0].(type) {
		case float64:
			out := make([][]float32, len(arr))
			for i, row := range arr {
				out[i] = toFloat32(row.([]any))
			}
			return out, nil
		case []any:
			// Token-level embeddings: mean-pool per input.
			out := make([][]float32, len(arr))
			for i, row := range arr {
				out[i] = meanPool(row.([]any))
			}
			return out, nil
		}
	}
	return nil, fmt.Errorf("HF response: unrecognised shape")
}

func toFloat32(arr []any) []float32 {
	out := make([]float32, len(arr))
	for i, v := range arr {
		f, _ := v.(float64)
		out[i] = float32(f)
	}
	return out
}

func meanPool(tokens []any) []float32 {
	if len(tokens) == 0 {
		return nil
	}
	first, _ := tokens[0].([]any)
	dim := len(first)
	sum := make([]float64, dim)
	for _, t := range tokens {
		row, _ := t.([]any)
		for i, v := range row {
			f, _ := v.(float64)
			sum[i] += f
		}
	}
	out := make([]float32, dim)
	n := float64(len(tokens))
	for i, v := range sum {
		out[i] = float32(v / n)
	}
	return out
}

func normalize(v []float32) []float32 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if sum == 0 {
		return v
	}
	norm := math.Sqrt(sum)
	for i := range v {
		v[i] = float32(float64(v[i]) / norm)
	}
	return v
}
