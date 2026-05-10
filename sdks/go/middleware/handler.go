package middleware

import (
	"context"
	"errors"
	"fmt"
	"html"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	cv "github.com/cvfile/cv-go/cv"
)

// Loader is the pluggable source of `.cv` bytes for a given URL path.
// Returning (nil, nil) means "not found" — return an error only when the
// underlying storage actually failed.
type Loader func(ctx context.Context, path string) ([]byte, error)

// Options tunes the generated handler.
type Options struct {
	// Root serves files from a filesystem directory. Mutually exclusive with Loader.
	Root string
	// Loader, if non-nil, replaces the filesystem lookup entirely.
	Loader Loader
	// CacheControl is the Cache-Control header value. Default: "public, max-age=300".
	CacheControl string
	// DefaultFormat is applied when no Accept and no ?format= query is provided.
	// Empty = "pdf".
	DefaultFormat ServeFormat
}

// Handler returns an http.Handler that serves `.cv` resources with full
// content negotiation.
func Handler(opts Options) (http.Handler, error) {
	if (opts.Root == "") == (opts.Loader == nil) {
		return nil, errors.New("middleware.Handler: provide exactly one of Root or Loader")
	}
	cacheControl := opts.CacheControl
	if cacheControl == "" {
		cacheControl = "public, max-age=300"
	}

	var baseRoot string
	if opts.Root != "" {
		abs, err := filepath.Abs(opts.Root)
		if err != nil {
			return nil, fmt.Errorf("resolve Root %q: %w", opts.Root, err)
		}
		baseRoot = abs
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		formatQuery := r.URL.Query().Get("format")
		if formatQuery == "" && opts.DefaultFormat != "" {
			formatQuery = string(opts.DefaultFormat)
		}

		bytes, err := loadCv(r.Context(), r.URL.Path, baseRoot, opts.Loader)
		if err != nil {
			http.Error(w, "load failed", http.StatusInternalServerError)
			return
		}
		if bytes == nil {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		if !cv.IsCvFile(bytes) {
			http.Error(w, "Not a .cv file", http.StatusUnsupportedMediaType)
			return
		}

		body, contentType, language, format, err := serve(bytes, NegotiateInput{
			Accept:         r.Header.Get("Accept"),
			AcceptLanguage: r.Header.Get("Accept-Language"),
			FormatQuery:    formatQuery,
		})
		if err != nil {
			http.Error(w, "extract failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		filename := filenameForFormat(r.URL.Path, format)
		header := w.Header()
		header.Set("Content-Type", contentType)
		header.Set("Content-Length", strconv.Itoa(len(body)))
		header.Set("Vary", "Accept, Accept-Language")
		header.Set("Link", BuildLinkHeader(r.URL.Path))
		header.Set("Cache-Control", cacheControl)
		header.Set("Content-Disposition", `inline; filename="`+filename+`"`)
		if language != "" {
			header.Set("Content-Language", language)
		}
		w.WriteHeader(http.StatusOK)
		if r.Method == http.MethodHead {
			return
		}
		_, _ = w.Write(body)
	}), nil
}

func loadCv(ctx context.Context, urlPath, baseRoot string, loader Loader) ([]byte, error) {
	if loader != nil {
		return loader(ctx, urlPath)
	}
	if baseRoot == "" {
		return nil, nil
	}
	rel := filepath.Clean(strings.TrimLeft(urlPath, "/\\"))
	full := filepath.Join(baseRoot, rel)
	abs, err := filepath.Abs(full)
	if err != nil {
		return nil, nil
	}
	if abs != baseRoot && !strings.HasPrefix(abs, baseRoot+string(os.PathSeparator)) {
		return nil, nil // path traversal — silently 404
	}
	info, err := os.Stat(abs)
	if err != nil || info.IsDir() {
		return nil, nil
	}
	return os.ReadFile(abs)
}

func serve(cvBytes []byte, in NegotiateInput) (body []byte, contentType string, language string, format ServeFormat, err error) {
	decision := Negotiate(in)
	if decision.Format == FormatPDF {
		return cvBytes, PDFPrimaryMIME, decision.Language, FormatPDF, nil
	}

	file, err := cv.Extract(cvBytes)
	if err != nil {
		return nil, "", "", "", err
	}
	preferLang := decision.Language
	if preferLang == "" {
		preferLang = file.Metadata.PrimaryLanguage
	}

	if decision.Format == FormatMarkdown {
		md := pickPayload(file, "text/markdown", preferLang)
		if md != nil {
			lang := md.Language
			if lang == "" {
				lang = preferLang
			}
			return md.Bytes, "text/markdown; charset=utf-8; cv-language=" + lang, md.Language, FormatMarkdown, nil
		}
		return cvBytes, PDFPrimaryMIME, decision.Language, FormatPDF, nil
	}

	if decision.Format == FormatHTML {
		htmlPayload := pickPayload(file, "text/html", preferLang)
		if htmlPayload != nil {
			lang := htmlPayload.Language
			if lang == "" {
				lang = preferLang
			}
			return htmlPayload.Bytes, "text/html; charset=utf-8; cv-language=" + lang, htmlPayload.Language, FormatHTML, nil
		}
		md := pickPayload(file, "text/markdown", preferLang)
		if md != nil {
			rendered := renderMarkdownAsHTML(string(md.Bytes), file)
			return []byte(rendered), "text/html; charset=utf-8", md.Language, FormatHTML, nil
		}
		return cvBytes, PDFPrimaryMIME, decision.Language, FormatPDF, nil
	}

	return cvBytes, PDFPrimaryMIME, decision.Language, FormatPDF, nil
}

func pickPayload(file *cv.File, mime, preferLang string) *cv.ExtractedPayload {
	var first *cv.ExtractedPayload
	for i := range file.Payloads {
		p := &file.Payloads[i]
		if p.MimeType != mime {
			continue
		}
		if p.Language == preferLang {
			return p
		}
		if first == nil {
			first = p
		}
	}
	return first
}

func filenameForFormat(urlPath string, format ServeFormat) string {
	base := urlPath
	if i := strings.LastIndex(base, "/"); i >= 0 {
		base = base[i+1:]
	}
	if base == "" {
		base = "document"
	}
	stem := base
	for _, suffix := range []string{".cv", ".pdf", ".md", ".html"} {
		if strings.HasSuffix(strings.ToLower(stem), suffix) {
			stem = stem[:len(stem)-len(suffix)]
			break
		}
	}
	if stem == "" {
		stem = "document"
	}
	switch format {
	case FormatMarkdown:
		return stem + ".md"
	case FormatHTML:
		return stem + ".html"
	default:
		return stem + ".cv"
	}
}

func renderMarkdownAsHTML(md string, file *cv.File) string {
	safe := html.EscapeString(md)
	lang := file.Metadata.PrimaryLanguage
	title := html.EscapeString(file.Metadata.PrimaryPayload)
	return "<!doctype html>\n" +
		`<html lang="` + lang + `">` + "\n" +
		"<head>\n" +
		`<meta charset="utf-8">` + "\n" +
		"<title>" + title + "</title>\n" +
		"</head>\n" +
		"<body>\n" +
		"<pre>" + safe + "</pre>\n" +
		"</body>\n" +
		"</html>"
}
