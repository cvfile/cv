// Package cvdetector is a tiny standalone sniffer for the .cv open file format.
//
// A .cv file is a valid PDF that carries Markdown and HTML payloads via PDF
// Associated Files (/AF). Crawlers that already read application/pdf can use
// this package to (a) detect a .cv wrapper inside an arbitrary PDF and (b)
// unwrap the canonical Markdown payload directly, skipping OCR over the
// visual layer entirely.
//
// Detect is dependency free regex over the PDF bytes (the XMP packet is
// plain XML embedded in the PDF). Unwrap depends on pdfcpu only because PDF
// stream parsing without a library is genuinely error prone.
//
// Spec: https://cvfile.org/spec/
package cvdetector

import (
	"bytes"
	"fmt"
	"regexp"

	pdfapi "github.com/pdfcpu/pdfcpu/pkg/api"
	pdfmodel "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	pdfTypes "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// CVNamespaceURI is the XMP namespace URI declared by every .cv file.
const CVNamespaceURI = "http://ns.cvfile.org/cv/1.0/"

// CvDetection summarises whether a byte slice is a .cv file and surfaces the
// fields from the cv XMP packet that crawlers most often need.
type CvDetection struct {
	IsCvFile        bool
	Version         string
	PrimaryPayload  string
	PrimaryLanguage string
	Generator       string
}

// UnwrappedPayload is one /AF Associated File extracted from a .cv file.
type UnwrappedPayload struct {
	Name     string
	MimeType string
	Bytes    []byte
}

// Detect returns a CvDetection describing whether pdfBytes is a .cv file.
// Zero dependencies, byte scan only.
func Detect(pdfBytes []byte) CvDetection {
	if len(pdfBytes) < 4 || !bytes.HasPrefix(pdfBytes, []byte("%PDF")) {
		return CvDetection{}
	}
	if !bytes.Contains(pdfBytes, []byte(CVNamespaceURI)) {
		return CvDetection{}
	}
	version := innerTag(pdfBytes, "cv:version")
	if version == "" {
		return CvDetection{}
	}
	return CvDetection{
		IsCvFile:        true,
		Version:         version,
		PrimaryPayload:  innerTag(pdfBytes, "cv:primaryPayload"),
		PrimaryLanguage: innerTag(pdfBytes, "cv:primaryLanguage"),
		Generator:       innerTag(pdfBytes, "cv:generator"),
	}
}

// Unwrap extracts one /AF Associated File from a .cv file by name. If
// payloadName is empty, returns the payload declared by cv:primaryPayload
// (typically "resume.md"). Returns (nil, nil) when the input is not a .cv
// or the named payload is not present; an error only when the PDF is
// malformed at the parser level.
func Unwrap(pdfBytes []byte, payloadName string) (*UnwrappedPayload, error) {
	det := Detect(pdfBytes)
	if !det.IsCvFile {
		return nil, nil
	}
	target := payloadName
	if target == "" {
		target = det.PrimaryPayload
	}
	if target == "" {
		return nil, nil
	}

	ctx, err := pdfapi.ReadContext(bytes.NewReader(pdfBytes), pdfmodel.NewDefaultConfiguration())
	if err != nil {
		return nil, fmt.Errorf("read pdf: %w", err)
	}

	root, err := ctx.XRefTable.Catalog()
	if err != nil {
		return nil, fmt.Errorf("catalog: %w", err)
	}
	afObj, ok := root.Find("AF")
	if !ok {
		return nil, nil
	}
	afResolved, err := ctx.Dereference(afObj)
	if err != nil {
		return nil, err
	}
	arr, ok := afResolved.(pdfTypes.Array)
	if !ok {
		return nil, nil
	}

	for _, entry := range arr {
		fsResolved, err := ctx.Dereference(entry)
		if err != nil {
			continue
		}
		fs, ok := fsResolved.(pdfTypes.Dict)
		if !ok {
			continue
		}
		name := stringEntry(fs, "UF")
		if name == "" {
			name = stringEntry(fs, "F")
		}
		if name != target {
			continue
		}
		efObj, ok := fs.Find("EF")
		if !ok {
			continue
		}
		efResolved, err := ctx.Dereference(efObj)
		if err != nil {
			continue
		}
		ef, ok := efResolved.(pdfTypes.Dict)
		if !ok {
			continue
		}
		streamObj, ok := ef.Find("UF")
		if !ok {
			streamObj, ok = ef.Find("F")
			if !ok {
				continue
			}
		}
		streamResolved, err := ctx.Dereference(streamObj)
		if err != nil {
			continue
		}
		stream, ok := streamResolved.(pdfTypes.StreamDict)
		if !ok {
			continue
		}
		if err := stream.Decode(); err != nil {
			return nil, fmt.Errorf("decode embedded stream %q: %w", name, err)
		}
		mime := nameEntry(stream.Dict, "Subtype")
		if mime == "" {
			mime = nameEntry(fs, "Subtype")
		}
		if mime == "" {
			mime = "application/octet-stream"
		}
		return &UnwrappedPayload{
			Name:     name,
			MimeType: mime,
			Bytes:    append([]byte(nil), stream.Content...),
		}, nil
	}

	return nil, nil
}

// innerTag reads a cv XMP field. RDF allows two equivalent serialisations:
// the element form <cv:version>1.0</cv:version> and the attribute form
// cv:version="1.0". We try the element form first, then fall back to the
// attribute form so both shapes are detected identically.
func innerTag(data []byte, tag string) string {
	q := regexp.QuoteMeta(tag)
	elem := regexp.MustCompile(`<` + q + `>([^<]*)</` + q + `>`)
	if m := elem.FindSubmatch(data); m != nil {
		return string(bytes.TrimSpace(m[1]))
	}
	attr := regexp.MustCompile(q + `\s*=\s*"([^"]*)"|` + q + `\s*=\s*'([^']*)'`)
	if m := attr.FindSubmatch(data); m != nil {
		val := m[1]
		if len(val) == 0 {
			val = m[2]
		}
		return string(bytes.TrimSpace(val))
	}
	return ""
}

func stringEntry(d pdfTypes.Dict, key string) string {
	v, ok := d.Find(key)
	if !ok {
		return ""
	}
	switch s := v.(type) {
	case pdfTypes.StringLiteral:
		return decodePDFString(string(s))
	case pdfTypes.HexLiteral:
		if b, err := s.Bytes(); err == nil {
			return string(b)
		}
	}
	return ""
}

// decodePDFString unescapes a PDF literal string per ISO 32000-1 §7.3.4.2:
// octal escapes (\ddd) and the standard \n \r \t \b \f \( \) \\ pairs.
// pypdf produces filenames like "resume\056md" — the dot must be decoded.
func decodePDFString(s string) string {
	var b []byte
	for i := 0; i < len(s); {
		c := s[i]
		if c != '\\' {
			b = append(b, c)
			i++
			continue
		}
		if i+1 >= len(s) {
			b = append(b, c)
			i++
			continue
		}
		next := s[i+1]
		if next >= '0' && next <= '7' {
			j, val := 0, 0
			for ; j < 3 && i+1+j < len(s); j++ {
				d := s[i+1+j]
				if d < '0' || d > '7' {
					break
				}
				val = val*8 + int(d-'0')
			}
			b = append(b, byte(val))
			i += 1 + j
			continue
		}
		switch next {
		case 'n':
			b = append(b, '\n')
		case 'r':
			b = append(b, '\r')
		case 't':
			b = append(b, '\t')
		case 'b':
			b = append(b, '\b')
		case 'f':
			b = append(b, '\f')
		case '(', ')', '\\':
			b = append(b, next)
		default:
			b = append(b, next)
		}
		i += 2
	}
	return string(b)
}

func nameEntry(d pdfTypes.Dict, key string) string {
	v, ok := d.Find(key)
	if !ok {
		return ""
	}
	if n, ok := v.(pdfTypes.Name); ok {
		return string(n)
	}
	return ""
}
