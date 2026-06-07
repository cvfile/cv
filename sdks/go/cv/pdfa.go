package cv

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	pdfTypes "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// PdfaConformance values for ValidationReport.Conformance.
//
// Only "structural-pass" and "failed" are produced by the in-process check
// below. "verified" is reserved for a future veraPDF-backed gate, and
// "not-checked" is the value under cv-lenient where the PDF/A check is skipped.
const (
	ConformanceVerified       = "verified"
	ConformanceStructuralPass = "structural-pass"
	ConformanceFailed         = "failed"
	ConformanceNotChecked     = "not-checked"
)

// checkPDFAConformance runs an in-process PDF/A-3u structural conformance check.
//
// This is deliberately NOT a full ISO 19005-3 validator: that is veraPDF's job,
// and the CLI / CI run it as the authoritative gate. What this DOES do is verify
// the load-bearing requirements that actually fail in practice when a real-world
// PDF (Word, Google Docs, Canva, "Print to PDF") is wrapped into a .cv, so the
// SDK can give an honest verdict in environments where veraPDF cannot run. The
// cardinal rule: never report a clean strict pass for a file we can prove is
// non-conformant. This mirrors the JS reference (packages/sdk-js/src/pdfa.ts);
// the issue codes, levels, and verdict logic match it exactly so the SDKs agree.
//
// xmpXML is the document's XMP packet, needed for the PDF/A identification
// markers (pdfaid:part / pdfaid:conformance) which live only in metadata.
//
// Returns:
//   - conformance: "failed" if any pdfa error was emitted, else "structural-pass".
//   - issues:      the pdfa3-* issues found (a single pdfa3-structural-pass
//     warning when no errors were found).
func checkPDFAConformance(ctx *model.Context, xmpXML string) (conformance string, issues []ValidationIssue) {
	checkFontsEmbedded(ctx, &issues)
	checkOutputIntent(ctx, &issues)
	checkPdfaIDMarkers(xmpXML, &issues)
	checkFileID(ctx, &issues)

	for _, i := range issues {
		if i.Level == "error" {
			return ConformanceFailed, issues
		}
	}

	issues = append(issues, ValidationIssue{
		Code:  "pdfa3-structural-pass",
		Level: "warning",
		Message: "Verified the load-bearing PDF/A-3u requirements in-process (embedded fonts, sRGB output intent, " +
			"PDF/A identification, file ID). Full ISO 19005-3 conformance additionally requires the veraPDF gate " +
			"(run `cv validate` in CI or the Docker runner in tools/verapdf-runner).",
	})
	return ConformanceStructuralPass, issues
}

var fontFileKeys = []string{"FontFile", "FontFile2", "FontFile3"}

// checkFontsEmbedded enforces PDF/A-3u §6.2.11.4.1: every font used in the file
// MUST be embedded. This is the single requirement a normal-looking input PDF
// most often violates: the standard-14 base fonts (Helvetica, Times, Courier)
// are referenced by name with no embedded program. We walk every Font dictionary
// from the catalog, descend Type0 composite fonts into their CIDFont descendant,
// and require a FontFile/FontFile2/FontFile3 in the descriptor. Type3 fonts carry
// their glyphs as content streams and need no FontFile, so they are treated as
// embedded. Reports are deduped by /BaseFont name so a font reused on many pages
// yields a single issue.
func checkFontsEmbedded(ctx *model.Context, issues *[]ValidationIssue) {
	seen := map[int]struct{}{}
	reported := map[string]struct{}{}

	root, err := ctx.Catalog()
	if err != nil || root == nil {
		return
	}
	walkFonts(ctx, root, seen, reported, issues)
}

func walkFonts(ctx *model.Context, obj pdfTypes.Object, seen map[int]struct{}, reported map[string]struct{}, issues *[]ValidationIssue) {
	if obj == nil {
		return
	}
	if ref, ok := obj.(pdfTypes.IndirectRef); ok {
		num := ref.ObjectNumber.Value()
		if _, done := seen[num]; done {
			return
		}
		seen[num] = struct{}{}
		resolved, err := ctx.Dereference(ref)
		if err != nil {
			return
		}
		walkFonts(ctx, resolved, seen, reported, issues)
		return
	}

	switch v := obj.(type) {
	case pdfTypes.Dict:
		inspectFontDict(ctx, v, reported, issues)
		for _, value := range v {
			walkFonts(ctx, value, seen, reported, issues)
		}
	case pdfTypes.StreamDict:
		inspectFontDict(ctx, v.Dict, reported, issues)
		for _, value := range v.Dict {
			walkFonts(ctx, value, seen, reported, issues)
		}
	case pdfTypes.Array:
		for _, item := range v {
			walkFonts(ctx, item, seen, reported, issues)
		}
	}
}

func inspectFontDict(ctx *model.Context, d pdfTypes.Dict, reported map[string]struct{}, issues *[]ValidationIssue) {
	if nameOfEntry(d, "Type") != "Font" {
		return
	}
	if isFontEmbedded(ctx, d) {
		return
	}
	name := fontName(d)
	if _, done := reported[name]; done {
		return
	}
	reported[name] = struct{}{}
	*issues = append(*issues, ValidationIssue{
		Code:  "pdfa3-font-not-embedded",
		Level: "error",
		Message: fmt.Sprintf("Font %q is not embedded; PDF/A-3u requires every font to be embedded "+
			"(ISO 19005-3 §6.2.11.4.1). The input PDF used a non-embedded font (often a standard-14 "+
			"base font from a minimal exporter). Re-export with fonts embedded, or normalize the PDF first.", name),
	})
}

func fontName(d pdfTypes.Dict) string {
	if n := nameOfEntry(d, "BaseFont"); n != "" {
		return n
	}
	return "unknown"
}

func isFontEmbedded(ctx *model.Context, fontDict pdfTypes.Dict) bool {
	subtype := nameOfEntry(fontDict, "Subtype")

	// Type3 glyphs are inline content streams: embedded by construction.
	if subtype == "Type3" {
		return true
	}

	// Type0 is a composite font: the real program lives on the CIDFont descendant.
	if subtype == "Type0" {
		descObj, ok := fontDict.Find("DescendantFonts")
		if !ok {
			return false
		}
		arr := dereferenceArray(ctx, descObj)
		if len(arr) == 0 {
			return false
		}
		cidFont := dereferenceDict(ctx, arr[0])
		if cidFont == nil {
			return false
		}
		return descriptorHasFontFile(ctx, cidFont)
	}

	return descriptorHasFontFile(ctx, fontDict)
}

func descriptorHasFontFile(ctx *model.Context, fontDict pdfTypes.Dict) bool {
	descObj, ok := fontDict.Find("FontDescriptor")
	if !ok {
		return false
	}
	descriptor := dereferenceDict(ctx, descObj)
	if descriptor == nil {
		return false
	}
	for _, key := range fontFileKeys {
		if _, ok := descriptor.Find(key); ok {
			return true
		}
	}
	return false
}

// checkOutputIntent applies PDF/A §6.2.2: an OutputIntent is only MANDATORY when
// the file uses device-dependent colour (DeviceRGB/Gray/CMYK) without a
// calibrated alternative. A text-only resume with no colour operators is
// conformant without one, so its absence is reported as a warning, not a hard
// failure: proving the colour condition in-process would require walking every
// content stream, and false-failing a conformant file is worse than deferring to
// veraPDF. pack adds an sRGB intent, so files this SDK produces always carry one;
// a malformed intent that IS present is still only flagged as suspicious.
func checkOutputIntent(ctx *model.Context, issues *[]ValidationIssue) {
	root, err := ctx.Catalog()
	if err != nil || root == nil {
		return
	}
	intentsObj, ok := root.Find("OutputIntents")
	intents := pdfTypes.Array(nil)
	if ok {
		intents = dereferenceArray(ctx, intentsObj)
	}
	if len(intents) == 0 {
		*issues = append(*issues, ValidationIssue{
			Code:  "pdfa3-no-output-intent",
			Level: "warning",
			Message: "No /OutputIntents present. PDF/A-3u requires a GTS_PDFA1 output intent only when the file uses " +
				"device-dependent colour (ISO 19005-3 §6.2.2); veraPDF makes the final call. `pack` adds an sRGB " +
				"intent, so this is typically an externally produced file.",
		})
		return
	}

	for _, entry := range intents {
		intent := dereferenceDict(ctx, entry)
		if intent == nil {
			continue
		}
		isPdfaIntent := nameOfEntry(intent, "S") == "GTS_PDFA1"
		_, hasProfile := intent.Find("DestOutputProfile")
		if isPdfaIntent && hasProfile {
			return
		}
	}

	*issues = append(*issues, ValidationIssue{
		Code:  "pdfa3-output-intent-incomplete",
		Level: "warning",
		Message: "An /OutputIntents array is present but none is a GTS_PDFA1 intent carrying an embedded " +
			"DestOutputProfile; veraPDF will confirm whether this is conformant (ISO 19005-3 §6.2.2).",
	})
}

// checkPdfaIDMarkers applies PDF/A §6.7.11: the file MUST be identified as PDF/A
// in XMP via the pdfaid namespace: pdfaid:part = 3 and pdfaid:conformance = A |
// U | B. These appear only in metadata, so we read the XMP packet directly. Both
// attribute form (pdfaid:part="3") and element form (<pdfaid:part>3</pdfaid:part>)
// are accepted.
func checkPdfaIDMarkers(xmpXML string, issues *[]ValidationIssue) {
	if xmpXML == "" {
		*issues = append(*issues, ValidationIssue{
			Code:    "pdfa3-no-id-markers",
			Level:   "error",
			Message: "XMP packet is absent; PDF/A-3u requires pdfaid:part and pdfaid:conformance markers.",
		})
		return
	}

	part, partOK := readXMPValue(xmpXML, "pdfaid:part")
	conformance, _ := readXMPValue(xmpXML, "pdfaid:conformance")

	if !partOK || part != "3" {
		shown := part
		if !partOK {
			shown = "absent"
		}
		*issues = append(*issues, ValidationIssue{
			Code:    "pdfa3-id-part-mismatch",
			Level:   "error",
			Message: fmt.Sprintf("PDF/A identification pdfaid:part is %q; PDF/A-3u requires part 3 (ISO 19005-3 §6.7.11).", shown),
		})
	}
	if !isPdfaConformanceLetter(conformance) {
		shown := conformance
		if conformance == "" {
			shown = "absent"
		}
		*issues = append(*issues, ValidationIssue{
			Code:  "pdfa3-id-conformance-missing",
			Level: "error",
			Message: fmt.Sprintf("PDF/A identification pdfaid:conformance is %q; "+
				"PDF/A-3u requires A, U, or B (ISO 19005-3 §6.7.11).", shown),
		})
	}
}

func isPdfaConformanceLetter(s string) bool {
	return s == "A" || s == "U" || s == "B"
}

// readXMPValue reads a pdfaid value in either attribute (pdfaid:part="3") or
// element (<pdfaid:part>3</pdfaid:part>) form. The bool reports whether the key
// was present at all, so an absent marker can be distinguished from an empty one.
func readXMPValue(xml, key string) (string, bool) {
	esc := regexp.QuoteMeta(key)
	if m := regexp.MustCompile(esc + `\s*=\s*["']([^"']*)["']`).FindStringSubmatch(xml); m != nil {
		return strings.TrimSpace(m[1]), true
	}
	if m := regexp.MustCompile(`<` + esc + `[^>]*>([^<]*)</` + esc + `>`).FindStringSubmatch(xml); m != nil {
		return strings.TrimSpace(m[1]), true
	}
	return "", false
}

// checkFileID applies PDF/A §6.1.3: the trailer MUST contain a file identifier
// (/ID) with at least two elements.
func checkFileID(ctx *model.Context, issues *[]ValidationIssue) {
	if len(ctx.ID) >= 2 {
		return
	}
	*issues = append(*issues, ValidationIssue{
		Code:    "pdfa3-no-file-id",
		Level:   "error",
		Message: "Trailer is missing a file identifier (/ID); PDF/A-3u requires one (ISO 19005-3 §6.1.3).",
	})
}

func dereferenceDict(ctx *model.Context, obj pdfTypes.Object) pdfTypes.Dict {
	if ref, ok := obj.(pdfTypes.IndirectRef); ok {
		resolved, err := ctx.Dereference(ref)
		if err != nil {
			return nil
		}
		obj = resolved
	}
	switch v := obj.(type) {
	case pdfTypes.Dict:
		return v
	case pdfTypes.StreamDict:
		return v.Dict
	}
	return nil
}

func dereferenceArray(ctx *model.Context, obj pdfTypes.Object) pdfTypes.Array {
	if ref, ok := obj.(pdfTypes.IndirectRef); ok {
		resolved, err := ctx.Dereference(ref)
		if err != nil {
			return nil
		}
		obj = resolved
	}
	if arr, ok := obj.(pdfTypes.Array); ok {
		return arr
	}
	return nil
}
