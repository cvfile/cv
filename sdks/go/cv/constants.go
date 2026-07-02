// Package cv is the reference SDK for the .cv open file format.
package cv

// Version is the release version of this SDK package, distinct from the
// .cv spec version it implements (SpecVersion).
const Version = "0.3.1"

// Spec version emitted by this SDK.
const SpecVersion = "1.0"

// Namespace and prefix for the cv: XMP vocabulary.
const (
	NamespaceURI    = "http://ns.cvfile.org/cv/1.0/"
	NamespacePrefix = "cv"
)

// DefaultGenerator is emitted in cv:generator when not overridden. It stamps
// the SDK version (the tool that produced the file), not the spec version.
const DefaultGenerator = "cv-go/" + Version

// Default filenames for the canonical payloads.
const (
	NameMarkdown   = "resume.md"
	NameHTML       = "resume.html"
	NameJSON       = "resume.json"
	NameEmbeddings = "embeddings.cbor"
)

// Default MIME types.
const (
	MimeMarkdown   = "text/markdown"
	MimeHTML       = "text/html"
	MimeJSON       = "application/json"
	MimeEmbeddings = "application/vnd.cv.embeddings+cbor"
	MimePDF        = "application/pdf"
	MimeCV         = "application/vnd.cv+pdf"
)

// MaxPayloadBytesDefault is the cap enforced by the validator on a single
// decompressed payload. Producers may override per Payload but consumers
// SHOULD reject anything beyond this without explicit opt-in.
const MaxPayloadBytesDefault = 16 * 1024 * 1024
