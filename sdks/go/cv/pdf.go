package cv

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	pdfTypes "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// loadContext loads a PDF into pdfcpu's Context.
func loadContext(pdfBytes []byte) (*model.Context, error) {
	conf := model.NewDefaultConfiguration()
	conf.ValidationMode = model.ValidationRelaxed
	ctx, err := api.ReadContext(bytes.NewReader(pdfBytes), conf)
	if err != nil {
		return nil, fmt.Errorf("read PDF: %w", err)
	}
	return ctx, nil
}

// readMetadataXML returns the catalog's /Metadata stream as a string.
func readMetadataXML(ctx *model.Context) (string, error) {
	rootDict, err := ctx.XRefTable.Catalog()
	if err != nil {
		return "", err
	}
	metaObj, ok := rootDict.Find("Metadata")
	if !ok {
		return "", nil
	}
	obj, err := ctx.Dereference(metaObj)
	if err != nil {
		return "", err
	}
	stream, ok := obj.(pdfTypes.StreamDict)
	if !ok {
		return "", nil
	}
	if err := stream.Decode(); err != nil {
		return "", fmt.Errorf("decode metadata stream: %w", err)
	}
	return string(stream.Content), nil
}

// rawPayload mirrors the JS/Python representation.
type rawPayload struct {
	Name         string
	MimeType     string
	Description  string
	Relationship AFRelationship
	Bytes        []byte
}

// readAssociatedFiles walks the catalog /AF array and returns each payload.
func readAssociatedFiles(ctx *model.Context) ([]rawPayload, error) {
	rootDict, err := ctx.XRefTable.Catalog()
	if err != nil {
		return nil, err
	}
	afObj, ok := rootDict.Find("AF")
	if !ok {
		return nil, nil
	}
	resolved, err := ctx.Dereference(afObj)
	if err != nil {
		return nil, err
	}
	arr, ok := resolved.(pdfTypes.Array)
	if !ok {
		return nil, fmt.Errorf("/AF is not an array")
	}

	var out []rawPayload
	for _, entry := range arr {
		fsResolved, err := ctx.Dereference(entry)
		if err != nil {
			continue
		}
		fs, ok := fsResolved.(pdfTypes.Dict)
		if !ok {
			continue
		}
		payload, err := parseFilespec(ctx, fs)
		if err == nil && payload != nil {
			out = append(out, *payload)
		}
	}
	return out, nil
}

func parseFilespec(ctx *model.Context, fs pdfTypes.Dict) (*rawPayload, error) {
	efObj, ok := fs.Find("EF")
	if !ok {
		return nil, nil
	}
	efResolved, err := ctx.Dereference(efObj)
	if err != nil {
		return nil, err
	}
	ef, ok := efResolved.(pdfTypes.Dict)
	if !ok {
		return nil, nil
	}
	streamObj, ok := ef.Find("UF")
	if !ok {
		streamObj, ok = ef.Find("F")
		if !ok {
			return nil, nil
		}
	}
	streamResolved, err := ctx.Dereference(streamObj)
	if err != nil {
		return nil, err
	}
	stream, ok := streamResolved.(pdfTypes.StreamDict)
	if !ok {
		return nil, nil
	}
	if err := stream.Decode(); err != nil {
		return nil, fmt.Errorf("decode embedded stream: %w", err)
	}

	name := stringValue(fs, "UF")
	if name == "" {
		name = stringValue(fs, "F")
	}
	desc := stringValue(fs, "Desc")

	mime := nameValue(stream.Dict, "Subtype")
	if mime == "" {
		mime = nameValue(fs, "Subtype")
	}
	if mime == "" {
		mime = "application/octet-stream"
	}

	rel := AFRelationship(nameValue(fs, "AFRelationship"))
	if rel != RelAlternative && rel != RelData && rel != RelSupplement {
		rel = RelSupplement
	}

	return &rawPayload{
		Name:         name,
		MimeType:     mime,
		Description:  desc,
		Relationship: rel,
		Bytes:        append([]byte(nil), stream.Content...),
	}, nil
}

func stringValue(d pdfTypes.Dict, key string) string {
	v, ok := d.Find(key)
	if !ok {
		return ""
	}
	switch s := v.(type) {
	case pdfTypes.StringLiteral:
		return decodePDFTextString(decodePDFString(string(s)))
	case pdfTypes.HexLiteral:
		decoded, err := s.Bytes()
		if err == nil {
			return decodePDFTextString(string(decoded))
		}
	}
	return ""
}

// decodePDFTextString handles the two PDF "text string" encodings defined in
// ISO 32000-1 §7.9.2.2: UTF-16BE with BOM (FE FF) for Unicode, otherwise
// PDFDocEncoding (we treat as Latin-1 for the ASCII-only filenames we expect).
func decodePDFTextString(s string) string {
	b := []byte(s)
	if len(b) >= 2 && b[0] == 0xFE && b[1] == 0xFF {
		// UTF-16BE
		var out []rune
		for i := 2; i+1 < len(b); i += 2 {
			r := rune(b[i])<<8 | rune(b[i+1])
			out = append(out, r)
		}
		return string(out)
	}
	return s
}

func nameValue(d pdfTypes.Dict, key string) string {
	v, ok := d.Find(key)
	if !ok {
		return ""
	}
	if n, ok := v.(pdfTypes.Name); ok {
		return string(n)
	}
	return ""
}

// decodePDFString applies the PDF-string backslash escape rules
// (ISO 32000-1 §7.3.4.2). Producers like pypdf escape the dot character
// as octal \056; consumers must decode.
func decodePDFString(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); {
		c := s[i]
		if c != '\\' {
			b.WriteByte(c)
			i++
			continue
		}
		if i+1 >= len(s) {
			b.WriteByte(c)
			i++
			continue
		}
		next := s[i+1]
		if next >= '0' && next <= '7' {
			j := i + 2
			val := int(next - '0')
			for j < len(s) && j < i+4 && s[j] >= '0' && s[j] <= '7' {
				val = val*8 + int(s[j]-'0')
				j++
			}
			b.WriteByte(byte(val))
			i = j
			continue
		}
		switch next {
		case 'n':
			b.WriteByte('\n')
		case 'r':
			b.WriteByte('\r')
		case 't':
			b.WriteByte('\t')
		case 'b':
			b.WriteByte('\b')
		case 'f':
			b.WriteByte('\f')
		case '(', ')', '\\':
			b.WriteByte(next)
		case '\n', '\r':
			// line continuation
		default:
			b.WriteByte(next)
		}
		i += 2
	}
	return b.String()
}
