package cv

import (
	"strings"
	"testing"
)

// TestParseHFMatrixRaggedRowReturnsError feeds a ragged HF response like
// [[0.1,0.2],0.5] where the second row is a scalar instead of an array. The
// parser must return a descriptive error rather than panic on a type assertion.
func TestParseHFMatrixRaggedRowReturnsError(t *testing.T) {
	raw := []byte(`[[0.1,0.2],0.5]`)
	out, err := parseHFMatrix(raw, 2)
	if err == nil {
		t.Fatalf("expected error for ragged matrix, got %v", out)
	}
	if !strings.Contains(err.Error(), "row 1") {
		t.Errorf("error %q should mention the offending row", err)
	}
}

// TestParseHFMatrixRaggedTokenMatrixReturnsError feeds a token-level (3D)
// response whose second input is not a token matrix.
func TestParseHFMatrixRaggedTokenMatrixReturnsError(t *testing.T) {
	raw := []byte(`[[[0.1,0.2],[0.3,0.4]],0.5]`)
	out, err := parseHFMatrix(raw, 2)
	if err == nil {
		t.Fatalf("expected error for ragged token matrix, got %v", out)
	}
}

// TestMeanPoolRaggedTokensReturnsError exercises meanPool directly with tokens
// of differing length.
func TestMeanPoolRaggedTokensReturnsError(t *testing.T) {
	tokens := []any{[]any{0.1, 0.2}, []any{0.3}}
	if _, err := meanPool(tokens); err == nil {
		t.Fatal("expected error for ragged token rows")
	}
}
