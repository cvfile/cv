// Package middleware provides HTTP serving for `.cv` resources with content
// negotiation that mirrors @cvfile/server (Node) and cvfile.server (Python)
// exactly. The same Accept / ?format= request gets the same representation
// regardless of the implementing language.
package middleware

import (
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ServeFormat is the chosen representation: pdf, markdown, or html.
type ServeFormat string

const (
	FormatPDF      ServeFormat = "pdf"
	FormatMarkdown ServeFormat = "markdown"
	FormatHTML     ServeFormat = "html"

	// PDFPrimaryMIME is the cv-strict media type advertised in Link headers.
	PDFPrimaryMIME = "application/vnd.cv+pdf"
	// PDFFallbackMIME is the bare PDF type we accept on inbound Accept.
	PDFFallbackMIME = "application/pdf"
)

// NegotiationResult is the chosen format plus the language preference (if any).
type NegotiationResult struct {
	Format   ServeFormat
	Language string
}

// NegotiateInput is the raw HTTP-derived inputs.
type NegotiateInput struct {
	Accept         string
	AcceptLanguage string
	FormatQuery    string
}

var formatByMIME = map[string]ServeFormat{
	"text/markdown":          FormatMarkdown,
	"text/x-markdown":        FormatMarkdown,
	"text/html":              FormatHTML,
	"application/xhtml+xml":  FormatHTML,
	"application/pdf":        FormatPDF,
	"application/vnd.cv+pdf": FormatPDF,
}

var formatByQuery = map[string]ServeFormat{
	"md":       FormatMarkdown,
	"markdown": FormatMarkdown,
	"html":     FormatHTML,
	"pdf":      FormatPDF,
	"cv":       FormatPDF,
}

var qRE = regexp.MustCompile(`(?i)^q\s*=\s*(\d*\.?\d+)`)

type acceptEntry struct {
	Type string
	Q    float64
}

// ParseAccept returns Accept entries sorted by descending q-value.
func ParseAccept(header string) []acceptEntry {
	if header == "" {
		return nil
	}
	var out []acceptEntry
	for _, raw := range strings.Split(header, ",") {
		bits := strings.Split(strings.TrimSpace(raw), ";")
		for i := range bits {
			bits[i] = strings.TrimSpace(bits[i])
		}
		if len(bits) == 0 || bits[0] == "" {
			continue
		}
		q := 1.0
		for _, p := range bits[1:] {
			if m := qRE.FindStringSubmatch(p); len(m) > 1 {
				if v, err := strconv.ParseFloat(m[1], 64); err == nil {
					q = v
				}
			}
		}
		out = append(out, acceptEntry{Type: strings.ToLower(bits[0]), Q: q})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Q > out[j].Q })
	return out
}

// ParseAcceptLanguage returns language tags sorted by descending q-value,
// stripping any wildcard "*" entries.
func ParseAcceptLanguage(header string) []string {
	if header == "" {
		return nil
	}
	type pair struct {
		tag string
		q   float64
	}
	var pairs []pair
	for _, raw := range strings.Split(header, ",") {
		bits := strings.Split(strings.TrimSpace(raw), ";")
		for i := range bits {
			bits[i] = strings.TrimSpace(bits[i])
		}
		if len(bits) == 0 || bits[0] == "" {
			continue
		}
		tag := strings.ToLower(bits[0])
		if tag == "*" {
			continue
		}
		q := 1.0
		for _, p := range bits[1:] {
			if m := qRE.FindStringSubmatch(p); len(m) > 1 {
				if v, err := strconv.ParseFloat(m[1], 64); err == nil {
					q = v
				}
			}
		}
		pairs = append(pairs, pair{tag: tag, q: q})
	}
	sort.SliceStable(pairs, func(i, j int) bool { return pairs[i].q > pairs[j].q })
	tags := make([]string, len(pairs))
	for i, p := range pairs {
		tags[i] = p.tag
	}
	return tags
}

// Negotiate picks a format based on ?format=, then Accept, defaulting to PDF.
func Negotiate(in NegotiateInput) NegotiationResult {
	languages := ParseAcceptLanguage(in.AcceptLanguage)
	var lang string
	if len(languages) > 0 {
		lang = languages[0]
	}

	if in.FormatQuery != "" {
		if f, ok := formatByQuery[strings.ToLower(in.FormatQuery)]; ok {
			return NegotiationResult{Format: f, Language: lang}
		}
	}

	for _, a := range ParseAccept(in.Accept) {
		if direct, ok := formatByMIME[a.Type]; ok {
			return NegotiationResult{Format: direct, Language: lang}
		}
		if a.Type == "*/*" || a.Type == "application/*" {
			return NegotiationResult{Format: FormatPDF, Language: lang}
		}
		if a.Type == "text/*" {
			return NegotiationResult{Format: FormatHTML, Language: lang}
		}
	}

	return NegotiationResult{Format: FormatPDF, Language: lang}
}

// BuildLinkHeader composes the alternates Link header advertised on every
// `.cv` response so well-behaved clients can discover the markdown/html paths.
func BuildLinkHeader(selfURL string) string {
	sep := "?"
	if strings.Contains(selfURL, "?") {
		sep = "&"
	}
	return strings.Join([]string{
		`<` + selfURL + `>; rel="alternate"; type="` + PDFPrimaryMIME + `"`,
		`<` + selfURL + sep + `format=md>; rel="alternate"; type="text/markdown"`,
		`<` + selfURL + sep + `format=html>; rel="alternate"; type="text/html"`,
	}, ", ")
}
