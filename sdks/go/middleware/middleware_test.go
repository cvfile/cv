package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func repoFixturePath(rel string) string {
	_, file, _, _ := runtime.Caller(0)
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
	return filepath.Join(repoRoot, rel)
}

func loadFixture(t *testing.T) []byte {
	t.Helper()
	path := repoFixturePath("packages/sdk-js/examples/out/jane-doe.cv")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("fixture missing at %s", path)
	}
	return data
}

// --- conneg ---

func TestParseAcceptSortsByQ(t *testing.T) {
	parsed := ParseAccept("text/html;q=0.5, application/pdf;q=1.0, text/markdown")
	if parsed[len(parsed)-1].Type != "text/html" {
		t.Errorf("text/html should be last, got %v", parsed)
	}
}

func TestParseAcceptHandlesEmpty(t *testing.T) {
	if got := ParseAccept(""); got != nil {
		t.Errorf("expected nil, got %v", got)
	}
}

func TestParseAcceptLanguageFiltersStar(t *testing.T) {
	langs := ParseAcceptLanguage("fr-CA;q=0.9, *;q=0.1, en")
	for _, l := range langs {
		if l == "*" {
			t.Fatalf("* should be filtered: %v", langs)
		}
	}
	if langs[0] != "en" {
		t.Errorf("en (q=1) should be first, got %v", langs)
	}
}

func TestNegotiateByAccept(t *testing.T) {
	cases := []struct {
		accept string
		want   ServeFormat
	}{
		{"application/pdf", FormatPDF},
		{"text/markdown", FormatMarkdown},
		{"text/x-markdown", FormatMarkdown},
		{"text/html, application/pdf", FormatHTML},
		{"application/vnd.cv+pdf", FormatPDF},
		{"*/*", FormatPDF},
		{"text/*", FormatHTML},
		{"", FormatPDF},
	}
	for _, tc := range cases {
		got := Negotiate(NegotiateInput{Accept: tc.accept}).Format
		if got != tc.want {
			t.Errorf("Negotiate(%q).Format = %q, want %q", tc.accept, got, tc.want)
		}
	}
}

func TestNegotiateQueryOverridesAccept(t *testing.T) {
	got := Negotiate(NegotiateInput{Accept: "text/html", FormatQuery: "md"}).Format
	if got != FormatMarkdown {
		t.Errorf("query=md should win: got %q", got)
	}
}

func TestBuildLinkHeader(t *testing.T) {
	h := BuildLinkHeader("/cv/jane.cv")
	for _, want := range []string{PDFPrimaryMIME, "text/markdown", "text/html", "format=md", "format=html"} {
		if !strings.Contains(h, want) {
			t.Errorf("link header missing %q: %s", want, h)
		}
	}

	h2 := BuildLinkHeader("/cv/jane.cv?v=42")
	if !strings.Contains(h2, "&format=md") {
		t.Errorf("expected & separator, got %s", h2)
	}
}

// --- handler ---

func newRoot(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "jane.cv"), loadFixture(t), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return dir
}

func TestHandlerServesPDFByDefault(t *testing.T) {
	root := newRoot(t)
	h, err := Handler(Options{Root: root})
	if err != nil {
		t.Fatalf("Handler: %v", err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/jane.cv", nil)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != PDFPrimaryMIME {
		t.Errorf("Content-Type = %q, want %q", got, PDFPrimaryMIME)
	}
	if got := rec.Header().Get("Vary"); got != "Accept, Accept-Language" {
		t.Errorf("Vary = %q", got)
	}
	if rec.Header().Get("Link") == "" {
		t.Error("Link header missing")
	}
	if !strings.HasPrefix(rec.Body.String(), "%PDF-") {
		t.Errorf("body should start with %%PDF-")
	}
}

func TestHandlerServesMarkdownForTextAccept(t *testing.T) {
	root := newRoot(t)
	h, _ := Handler(Options{Root: root})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/jane.cv", nil)
	req.Header.Set("Accept", "text/markdown")
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/markdown") {
		t.Errorf("Content-Type = %q", rec.Header().Get("Content-Type"))
	}
	if !strings.HasPrefix(rec.Body.String(), "# ") {
		t.Errorf("body should start with markdown heading: %q", rec.Body.String()[:50])
	}
}

func TestHandlerQueryOverridesAccept(t *testing.T) {
	root := newRoot(t)
	h, _ := Handler(Options{Root: root})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/jane.cv?format=md", nil)
	req.Header.Set("Accept", "text/html")
	h.ServeHTTP(rec, req)

	if !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/markdown") {
		t.Errorf("?format=md should win, got %q", rec.Header().Get("Content-Type"))
	}
}

func TestHandler404ForMissingFile(t *testing.T) {
	dir := t.TempDir()
	h, _ := Handler(Options{Root: dir})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/missing.cv", nil)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

func TestHandler415ForNonCvFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "junk.cv"), []byte("not a pdf"), 0o644); err != nil {
		t.Fatalf("write junk: %v", err)
	}
	h, _ := Handler(Options{Root: dir})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/junk.cv", nil)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Errorf("status = %d, want 415", rec.Code)
	}
}

func TestHandlerLoaderAlternative(t *testing.T) {
	cvBytes := loadFixture(t)
	loader := func(_ context.Context, path string) ([]byte, error) {
		if path == "/in-memory.cv" {
			return cvBytes, nil
		}
		return nil, nil
	}
	h, err := Handler(Options{Loader: loader})
	if err != nil {
		t.Fatalf("Handler: %v", err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/in-memory.cv?format=md", nil)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/markdown") {
		t.Errorf("Content-Type = %q", rec.Header().Get("Content-Type"))
	}
}

func TestHandlerPathTraversalRejected(t *testing.T) {
	root := newRoot(t)
	h, _ := Handler(Options{Root: root})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/../../../etc/passwd", nil)
	h.ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		t.Errorf("path traversal should not return 200, got %d body=%q", rec.Code, rec.Body.String()[:60])
	}
}

func TestHandlerHEADReturnsNoBody(t *testing.T) {
	root := newRoot(t)
	h, _ := Handler(Options{Root: root})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodHead, "/jane.cv", nil)
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("HEAD body should be empty, got %d bytes", rec.Body.Len())
	}
	if rec.Header().Get("Content-Length") == "" {
		t.Error("Content-Length should be set on HEAD")
	}
}

func TestHandlerRequiresExactlyOneSource(t *testing.T) {
	if _, err := Handler(Options{}); err == nil {
		t.Error("expected error when neither Root nor Loader is set")
	}
	if _, err := Handler(Options{Root: ".", Loader: func(_ context.Context, _ string) ([]byte, error) { return nil, nil }}); err == nil {
		t.Error("expected error when both Root and Loader are set")
	}
}
