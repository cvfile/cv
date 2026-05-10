package cv

import "time"

// AFRelationship is the role a payload plays for the document
// (PDF/A-3 Associated File relationship).
type AFRelationship string

const (
	RelAlternative AFRelationship = "Alternative"
	RelData        AFRelationship = "Data"
	RelSupplement  AFRelationship = "Supplement"
)

// Payload is a single embedded file inside a .cv container.
type Payload struct {
	Data         []byte
	Name         string
	MimeType     string
	Language     string
	Relationship AFRelationship
	Description  string
}

// AlternateMeta describes one alternate payload entry recorded in XMP.
type AlternateMeta struct {
	Payload  string `json:"payload"`
	Language string `json:"language"`
	MimeType string `json:"mimeType"`
}

// IntegrityEntry is a per-payload digest recorded in XMP.
type IntegrityEntry struct {
	Payload   string `json:"payload"`
	Algorithm string `json:"algorithm"`
	Digest    string `json:"digest"`
}

// EmbeddingSpaceSummary is a per-space summary recorded in XMP.
type EmbeddingSpaceSummary struct {
	Model     string `json:"model"`
	Dimension int    `json:"dimension"`
	Metric    string `json:"metric"`
	Chunks    int    `json:"chunks"`
}

// Metadata describes everything the XMP packet carries.
type Metadata struct {
	Version         string
	PrimaryLanguage string
	PrimaryPayload  string
	Created         time.Time
	Modified        time.Time
	Generator       string
	Integrity       string // "sha-256" or "none"; controls write-time integrity emission
	Alternates      []AlternateMeta
	IntegrityList   []IntegrityEntry
	Embeddings      []EmbeddingSpaceSummary
}

// PackInput is the input to Pack.
type PackInput struct {
	PDF        []byte
	Markdown   []byte
	HTML       []byte
	JSON       any
	Embeddings []byte
	Payloads   []Payload
	Metadata   Metadata
	PDFA       *bool // pointer so nil means "default true"
}

// ExtractedPayload is one payload returned from Extract.
type ExtractedPayload struct {
	Name         string
	MimeType     string
	Relationship AFRelationship
	Language     string
	Description  string
	Bytes        []byte
}

// Text returns the payload bytes interpreted as UTF-8.
func (p ExtractedPayload) Text() string { return string(p.Bytes) }

// File is the parsed result of Extract.
type File struct {
	Bytes    []byte
	Metadata Metadata
	Payloads []ExtractedPayload
}

// ValidationLevel describes the conformance class checked.
type ValidationLevel string

const (
	LevelStrict  ValidationLevel = "cv-strict"
	LevelLenient ValidationLevel = "cv-lenient"
)

// ValidationIssue is a single complaint from validate.
type ValidationIssue struct {
	Code    string
	Level   string // "error" | "warning"
	Message string
	Payload string
}

// ValidationReport bundles the issues plus the overall verdict.
type ValidationReport struct {
	OK     bool
	Level  ValidationLevel
	Issues []ValidationIssue
}
