package cv

import "fmt"

// ExtractOptions controls payload extraction.
type ExtractOptions struct {
	// MaxPayloadBytes caps the decompressed size of each payload (spec §7.3).
	// Zero means DefaultMaxPayloadBytes. To disable the cap entirely, set
	// NoPayloadLimit; a bare zero keeps the default so existing callers stay
	// protected.
	MaxPayloadBytes int
	// NoPayloadLimit disables the decompressed-size cap. Only set this for
	// trusted inputs: a hostile file can inflate a few compressed kilobytes
	// into an arbitrarily large decompressed payload.
	NoPayloadLimit bool
}

// PayloadTooLargeError reports a payload whose decompressed size exceeds the
// configured cap. It mirrors the Python SDK's PayloadTooLargeError and the JS
// SDK's maxPayloadBytes abort.
type PayloadTooLargeError struct {
	Payload string
	Size    int
	Limit   int
}

func (e *PayloadTooLargeError) Error() string {
	return fmt.Sprintf("payload %q is %d bytes decompressed; cap is %d (spec §7.3)", e.Payload, e.Size, e.Limit)
}

// Extract parses a .cv file's metadata and embedded payloads. Payloads are
// capped at DefaultMaxPayloadBytes decompressed; use ExtractWithOptions to
// raise or disable the cap.
func Extract(data []byte) (*File, error) {
	return ExtractWithOptions(data, ExtractOptions{})
}

// ExtractWithOptions is Extract with an explicit payload-size policy. When a
// payload exceeds the cap the whole extraction fails with a
// *PayloadTooLargeError: the spec forbids silent truncation, so a reader
// either refuses the payload or returns it in full. pdfcpu inflates streams
// in one shot (no streaming abort hook), so the cap is enforced immediately
// post-decode, before the payload is retained or returned.
func ExtractWithOptions(data []byte, opts ExtractOptions) (*File, error) {
	maxPayload := opts.MaxPayloadBytes
	if maxPayload <= 0 {
		maxPayload = DefaultMaxPayloadBytes
	}
	if opts.NoPayloadLimit {
		maxPayload = 0
	}

	ctx, err := loadContext(data)
	if err != nil {
		return nil, err
	}
	xml, err := readMetadataXML(ctx)
	if err != nil {
		return nil, err
	}
	if xml == "" {
		return nil, fmt.Errorf("not a .cv file: no /Metadata stream in catalog")
	}
	meta, ok := parseXMP(xml)
	if !ok {
		return nil, fmt.Errorf("not a .cv file: XMP missing required cv: properties")
	}

	rawList, err := readAssociatedFiles(ctx, maxPayload)
	if err != nil {
		return nil, err
	}

	altLang := make(map[string]string, len(meta.Alternates))
	for _, a := range meta.Alternates {
		altLang[a.Payload] = a.Language
	}

	payloads := make([]ExtractedPayload, 0, len(rawList))
	for _, raw := range rawList {
		lang, ok := altLang[raw.Name]
		if !ok {
			lang = meta.PrimaryLanguage
		}
		payloads = append(payloads, ExtractedPayload{
			Name:         raw.Name,
			MimeType:     raw.MimeType,
			Relationship: raw.Relationship,
			Language:     lang,
			Description:  raw.Description,
			Bytes:        raw.Bytes,
		})
	}

	return &File{
		Bytes:    data,
		Metadata: *meta,
		Payloads: payloads,
	}, nil
}

// ExtractMarkdown returns the markdown payload as a string, preferring the
// requested language. Returns "" if no markdown payload is present.
func ExtractMarkdown(data []byte, language string) (string, error) {
	file, err := Extract(data)
	if err != nil {
		return "", err
	}
	prefer := language
	if prefer == "" {
		prefer = file.Metadata.PrimaryLanguage
	}
	return pickText(file, MimeMarkdown, prefer), nil
}

// ExtractHTML returns the HTML payload as a string, preferring the requested
// language. Returns "" if no HTML payload is present.
func ExtractHTML(data []byte, language string) (string, error) {
	file, err := Extract(data)
	if err != nil {
		return "", err
	}
	prefer := language
	if prefer == "" {
		prefer = file.Metadata.PrimaryLanguage
	}
	return pickText(file, MimeHTML, prefer), nil
}

// ExtractEmbeddings returns the raw embeddings.cbor payload bytes.
func ExtractEmbeddings(data []byte) ([]byte, error) {
	file, err := Extract(data)
	if err != nil {
		return nil, err
	}
	for _, p := range file.Payloads {
		if p.Name == NameEmbeddings {
			return p.Bytes, nil
		}
	}
	return nil, nil
}

func pickText(file *File, mimeType, preferLang string) string {
	var first *ExtractedPayload
	for i := range file.Payloads {
		if file.Payloads[i].MimeType != mimeType {
			continue
		}
		if file.Payloads[i].Language == preferLang {
			return file.Payloads[i].Text()
		}
		if first == nil {
			first = &file.Payloads[i]
		}
	}
	if first != nil {
		return first.Text()
	}
	return ""
}
