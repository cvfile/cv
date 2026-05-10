package cv

import "fmt"

// Extract parses a .cv file's metadata and embedded payloads.
func Extract(data []byte) (*File, error) {
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

	rawList, err := readAssociatedFiles(ctx)
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
