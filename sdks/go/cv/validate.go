package cv

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
)

// DefaultMaxPayloadBytes is the per-payload decompressed-byte cap (spec §7.3).
const DefaultMaxPayloadBytes = 16 * 1024 * 1024

// knownMaxMajor is the highest cv: format MAJOR this SDK was built to read.
// Both "0.1" and "1.0" are accepted; a file declaring major >= 2 triggers a
// warning (spec §8.3) but is still extracted.
const knownMaxMajor = 1

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

	ctx, err := loadContext(data)
	if err != nil {
		// pdfcpu refuses to build a context for an encrypted document and tells
		// us so via its parse error; classify that as the spec-§3.4 encryption
		// rejection rather than a generic parse failure.
		code := "pdf-parse-failed"
		msg := err.Error()
		if isEncryptionError(err) {
			code = "encrypted-document"
			msg = "Trailer declares /Encrypt; encryption is forbidden in cv 1.0 (spec §3.4)"
		}
		issues = append(issues, ValidationIssue{
			Code:    code,
			Level:   "error",
			Message: msg,
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

	// Spec §8.3: accept files from the same MAJOR line (this SDK knows 0.x and
	// 1.0), but warn when the file declares a newer MAJOR we were not built for.
	// Extraction continues regardless; this is informational only.
	if major, ok := majorVersion(meta.Version); ok && major > knownMaxMajor {
		issues = append(issues, ValidationIssue{
			Code:    "newer-format-version",
			Level:   "warning",
			Message: fmt.Sprintf("File declares cv:version %q (major %d); this SDK knows up to major %d (spec §8.3)", meta.Version, major, knownMaxMajor),
		})
	}

	// The validator reads uncapped: it must see oversized payloads to report
	// payload-too-large below (and to run integrity checks on them), rather
	// than fail-fast the way the extract path does.
	rawList, err := readAssociatedFiles(ctx, 0)
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

	// Under cv-strict, run the in-process PDF/A-3u structural conformance check.
	// This replaces the former pdfa3-not-checked lie: the SDK now verifies the
	// load-bearing PDF/A-3u requirements (embedded fonts, output intent, PDF/A
	// identification, file ID) and reports an honest verdict, matching the JS SDK
	// (packages/sdk-js/src/pdfa.ts). Full ISO 19005-3 conformance still defers to
	// the veraPDF gate, surfaced as the pdfa3-structural-pass warning. Under
	// cv-lenient the check is skipped and Conformance is left empty (omitted).
	conformance := ""
	if level == LevelStrict {
		var pdfaIssues []ValidationIssue
		conformance, pdfaIssues = checkPDFAConformance(ctx, xml)
		issues = append(issues, pdfaIssues...)
	}

	ok = true
	for _, i := range issues {
		if i.Level == "error" {
			ok = false
			break
		}
	}
	return &ValidationReport{OK: ok, Level: level, Issues: issues, Conformance: conformance}
}

// isEncryptionError reports whether a pdfcpu read error stems from the document
// being encrypted. pdfcpu signals this through its parse error (it has no clean
// exported sentinel for the malformed-encryption case), so we match the stable
// "encryption" wording it uses. This keys off the parser's own diagnosis, not a
// byte scan of payload content, so it cannot false-positive on a payload that
// merely contains the literal "/Encrypt".
func isEncryptionError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, pdfcpu.ErrWrongPassword) || errors.Is(err, pdfcpu.ErrUnknownEncryption) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "encryption")
}

// majorVersion parses the MAJOR component of a "MAJOR.MINOR" cv:version string.
// Returns (0, false) when the string is empty or the major is not an integer.
func majorVersion(version string) (int, bool) {
	version = strings.TrimSpace(version)
	if version == "" {
		return 0, false
	}
	majorStr := version
	if i := strings.IndexByte(version, '.'); i >= 0 {
		majorStr = version[:i]
	}
	major, err := strconv.Atoi(majorStr)
	if err != nil {
		return 0, false
	}
	return major, true
}
