package cv

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// DefaultMaxPayloadBytes is the per-payload decompressed-byte cap (spec §7.3).
const DefaultMaxPayloadBytes = 16 * 1024 * 1024

// ValidateOptions controls the strictness of validation.
type ValidateOptions struct {
	Strict bool
	// MaxPayloadBytes overrides the per-payload size cap. Zero means default.
	MaxPayloadBytes int
}

// Validate runs structural and integrity checks against a .cv file.
func Validate(data []byte, opts ValidateOptions) *ValidationReport {
	level := LevelLenient
	if opts.Strict {
		level = LevelStrict
	}
	maxPayload := opts.MaxPayloadBytes
	if maxPayload <= 0 {
		maxPayload = DefaultMaxPayloadBytes
	}
	var issues []ValidationIssue

	if looksEncrypted(data) {
		issues = append(issues, ValidationIssue{
			Code:    "encrypted-document",
			Level:   "error",
			Message: "Trailer declares /Encrypt; encryption is forbidden in cv 0.x (spec §3.4)",
		})
		return &ValidationReport{OK: false, Level: level, Issues: issues}
	}

	ctx, err := loadContext(data)
	if err != nil {
		issues = append(issues, ValidationIssue{
			Code:    "pdf-parse-failed",
			Level:   "error",
			Message: err.Error(),
		})
		return &ValidationReport{OK: false, Level: level, Issues: issues}
	}

	issues = append(issues, scanForbiddenConstructs(ctx)...)

	xml, err := readMetadataXML(ctx)
	if err != nil || xml == "" {
		issues = append(issues, ValidationIssue{
			Code:    "no-xmp",
			Level:   "error",
			Message: "Document catalog is missing /Metadata stream",
		})
		return &ValidationReport{OK: false, Level: level, Issues: issues}
	}

	meta, ok := parseXMP(xml)
	if !ok {
		issues = append(issues, ValidationIssue{
			Code:    "xmp-missing-cv",
			Level:   "error",
			Message: "XMP packet missing required cv: properties",
		})
		return &ValidationReport{OK: false, Level: level, Issues: issues}
	}

	rawList, err := readAssociatedFiles(ctx)
	if err != nil {
		issues = append(issues, ValidationIssue{
			Code:    "af-read-failed",
			Level:   "error",
			Message: err.Error(),
		})
	}
	if len(rawList) == 0 {
		issues = append(issues, ValidationIssue{
			Code:    "no-payloads",
			Level:   "error",
			Message: "No /AF Associated Files present",
		})
	}

	for _, p := range rawList {
		if len(p.Bytes) > maxPayload {
			issues = append(issues, ValidationIssue{
				Code:    "payload-too-large",
				Level:   "error",
				Message: fmt.Sprintf("Payload %q is %d bytes; cap is %d (spec §7.3)", p.Name, len(p.Bytes), maxPayload),
				Payload: p.Name,
			})
		}
	}

	primaryFound := false
	for _, p := range rawList {
		if p.Name == meta.PrimaryPayload {
			primaryFound = true
			break
		}
	}
	if !primaryFound {
		issues = append(issues, ValidationIssue{
			Code:    "primary-missing",
			Level:   "error",
			Message: fmt.Sprintf("cv:primaryPayload %q not present in /AF", meta.PrimaryPayload),
		})
	}

	for _, entry := range meta.IntegrityList {
		var match *rawPayload
		for i := range rawList {
			if rawList[i].Name == entry.Payload {
				match = &rawList[i]
				break
			}
		}
		if match == nil {
			issues = append(issues, ValidationIssue{
				Code:    "integrity-payload-missing",
				Level:   "error",
				Message: fmt.Sprintf("Integrity entry references unknown payload %q", entry.Payload),
				Payload: entry.Payload,
			})
			continue
		}
		if entry.Algorithm == "sha-256" || entry.Algorithm == "sha256" {
			h := sha256.Sum256(match.Bytes)
			actual := hex.EncodeToString(h[:])
			if actual != entry.Digest {
				issues = append(issues, ValidationIssue{
					Code:    "integrity-mismatch",
					Level:   "error",
					Message: fmt.Sprintf("Integrity digest mismatch for %q", entry.Payload),
					Payload: entry.Payload,
				})
			}
		} else {
			issues = append(issues, ValidationIssue{
				Code:    "integrity-unsupported-algo",
				Level:   "warning",
				Message: fmt.Sprintf("Unsupported digest algorithm %q for %q", entry.Algorithm, entry.Payload),
				Payload: entry.Payload,
			})
		}
	}

	if level == LevelStrict {
		issues = append(issues, ValidationIssue{
			Code:    "pdfa3-not-checked",
			Level:   "warning",
			Message: "cv-strict requires veraPDF PDF/A-3u conformance, which this SDK does not run in-process",
		})
	}

	ok = true
	for _, i := range issues {
		if i.Level == "error" {
			ok = false
			break
		}
	}
	return &ValidationReport{OK: ok, Level: level, Issues: issues}
}

var encryptToken = []byte("/Encrypt")

// looksEncrypted is a byte-level pre-check on the trailer region: pdfcpu can
// load encrypted PDFs but our policy is to refuse them outright with the
// documented spec-§3.4 code regardless of parser behaviour.
func looksEncrypted(data []byte) bool {
	tail := data
	if len(data) > 4096 {
		tail = data[len(data)-4096:]
	}
	idx := bytes.Index(tail, encryptToken)
	if idx < 0 {
		return false
	}
	// Confirm word boundary (next byte is space, slash, newline, or EOF).
	end := idx + len(encryptToken)
	if end >= len(tail) {
		return true
	}
	c := tail[end]
	return c == ' ' || c == '\n' || c == '\r' || c == '\t' || c == '/' || c == '<' || c == '['
}
