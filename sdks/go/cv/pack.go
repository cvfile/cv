package cv

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// Pack builds a .cv file from the input PDF and one or more representations.
func Pack(in PackInput) ([]byte, error) {
	payloads, err := collectPayloads(in)
	if err != nil {
		return nil, err
	}
	if len(payloads) == 0 {
		return nil, fmt.Errorf("at least one payload (markdown, html, json, embeddings, or payloads) is required")
	}

	primaryLanguage := in.Metadata.PrimaryLanguage
	if primaryLanguage == "" {
		return nil, fmt.Errorf("metadata.PrimaryLanguage is required")
	}

	primaryPayload := in.Metadata.PrimaryPayload
	if primaryPayload == "" {
		primaryPayload = defaultPrimary(payloads)
	}
	if !containsPayload(payloads, primaryPayload) {
		return nil, fmt.Errorf("primary payload %q not found among payloads", primaryPayload)
	}

	created := in.Metadata.Created
	if created.IsZero() {
		created = time.Now().UTC()
	}
	modified := in.Metadata.Modified
	if modified.IsZero() {
		modified = created
	}

	integrity := in.Metadata.Integrity
	if integrity == "" {
		integrity = "sha-256"
	}

	var integrityList []IntegrityEntry
	if integrity == "sha-256" {
		for _, p := range payloads {
			h := sha256.Sum256(p.Data)
			integrityList = append(integrityList, IntegrityEntry{
				Payload:   p.Name,
				Algorithm: "sha-256",
				Digest:    hex.EncodeToString(h[:]),
			})
		}
	}

	ctx, err := loadContext(in.PDF)
	if err != nil {
		return nil, err
	}

	for _, p := range payloads {
		desc := p.Description
		if desc == "" {
			desc = defaultDescription(p)
		}
		rel := p.Relationship
		if rel == "" {
			rel = RelAlternative
		}
		if err := addAssociatedFile(ctx, p.Name, p.Data, p.MimeType, desc, rel, created, modified); err != nil {
			return nil, err
		}
	}

	var alternates []AlternateMeta
	for _, p := range payloads {
		if p.Name == primaryPayload {
			continue
		}
		rel := p.Relationship
		if rel == "" {
			rel = RelAlternative
		}
		if rel != RelAlternative {
			continue
		}
		lang := p.Language
		if lang == "" {
			lang = primaryLanguage
		}
		alternates = append(alternates, AlternateMeta{
			Payload:  p.Name,
			Language: lang,
			MimeType: p.MimeType,
		})
	}

	meta := Metadata{
		Version:         SpecVersion,
		PrimaryLanguage: primaryLanguage,
		PrimaryPayload:  primaryPayload,
		Created:         created,
		Modified:        modified,
		Generator:       in.Metadata.Generator,
	}
	xmp := buildXMP(meta, alternates, integrityList, in.Metadata.Embeddings)
	if err := setMetadataXML(ctx, xmp); err != nil {
		return nil, err
	}

	return writeContext(ctx)
}

func collectPayloads(in PackInput) ([]Payload, error) {
	var out []Payload
	if len(in.Markdown) > 0 {
		out = append(out, Payload{
			Data:         in.Markdown,
			Name:         NameMarkdown,
			MimeType:     MimeMarkdown,
			Relationship: RelAlternative,
		})
	}
	if len(in.HTML) > 0 {
		out = append(out, Payload{
			Data:         in.HTML,
			Name:         NameHTML,
			MimeType:     MimeHTML,
			Relationship: RelAlternative,
		})
	}
	if in.JSON != nil {
		body, err := json.MarshalIndent(in.JSON, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("marshal json payload: %w", err)
		}
		out = append(out, Payload{
			Data:         body,
			Name:         NameJSON,
			MimeType:     MimeJSON,
			Relationship: RelAlternative,
		})
	}
	if len(in.Embeddings) > 0 {
		out = append(out, Payload{
			Data:         in.Embeddings,
			Name:         NameEmbeddings,
			MimeType:     MimeEmbeddings,
			Relationship: RelData,
		})
	}
	out = append(out, in.Payloads...)

	seen := make(map[string]bool, len(out))
	for _, p := range out {
		if seen[p.Name] {
			return nil, fmt.Errorf("duplicate payload name: %s", p.Name)
		}
		seen[p.Name] = true
	}
	return out, nil
}

func defaultPrimary(payloads []Payload) string {
	for _, p := range payloads {
		if p.Name == NameMarkdown {
			return NameMarkdown
		}
	}
	for _, p := range payloads {
		if p.Name == NameHTML {
			return NameHTML
		}
	}
	for _, p := range payloads {
		rel := p.Relationship
		if rel == "" || rel == RelAlternative {
			return p.Name
		}
	}
	return payloads[0].Name
}

func defaultDescription(p Payload) string {
	switch p.MimeType {
	case MimeMarkdown:
		return "Markdown representation"
	case MimeHTML:
		return "HTML representation"
	case MimeJSON:
		return "JSON Resume representation"
	case MimeEmbeddings:
		return "Pre-computed embeddings"
	}
	return p.Name
}

func containsPayload(payloads []Payload, name string) bool {
	for _, p := range payloads {
		if p.Name == name {
			return true
		}
	}
	return false
}
