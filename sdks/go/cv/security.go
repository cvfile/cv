package cv

import (
	"fmt"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	pdfTypes "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// scanForbiddenConstructs walks the object graph from the catalog (resolving
// indirect refs and descending into every dict/array value) and reports
// constructs prohibited by .cv spec §3.4. Walking the graph rather than just
// the xref table means forbidden actions stored as DIRECT (inline) children —
// e.g. a catalog /OpenAction << /S /JavaScript /JS (...) >> — are still caught.
// Error codes match the JS and Python SDKs so cross-language tests share
// expectations. This mirrors the Python _security.py implementation.
func scanForbiddenConstructs(ctx *model.Context) []ValidationIssue {
	var issues []ValidationIssue

	if ctx.Encrypt != nil {
		issues = append(issues, ValidationIssue{
			Code:    "encrypted-document",
			Level:   "error",
			Message: "Trailer declares /Encrypt; encryption is forbidden in cv 0.x (spec §3.4)",
		})
	}

	root, err := ctx.Catalog()
	if err == nil && root != nil {
		seen := map[int]struct{}{}
		walkSecurityObject(ctx, root, seen, &issues)
	}

	return dedupeIssues(issues)
}

// walkSecurityObject recursively descends an object, resolving indirect refs.
// The visited set is keyed by indirect-object number to avoid cycles; direct
// (inline) dicts and arrays are always descended.
func walkSecurityObject(ctx *model.Context, obj pdfTypes.Object, seen map[int]struct{}, issues *[]ValidationIssue) {
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
		walkSecurityObject(ctx, resolved, seen, issues)
		return
	}

	switch v := obj.(type) {
	case pdfTypes.Dict:
		inspectSecurityDict(ctx, v, issues)
		for _, value := range v {
			walkSecurityObject(ctx, value, seen, issues)
		}
	case pdfTypes.StreamDict:
		inspectSecurityDict(ctx, v.Dict, issues)
		for _, value := range v.Dict {
			walkSecurityObject(ctx, value, seen, issues)
		}
	case pdfTypes.Array:
		for _, item := range v {
			walkSecurityObject(ctx, item, seen, issues)
		}
	}
}

func inspectSecurityDict(ctx *model.Context, d pdfTypes.Dict, issues *[]ValidationIssue) {
	typeName := nameOfEntry(d, "Type")
	subtype := nameOfEntry(d, "S")

	if typeName == "Action" || subtype != "" {
		inspectActionDict(ctx, d, subtype, issues)
	}

	if typeName == "Filespec" {
		inspectFilespecDict(d, issues)
	}

	if _, hasJS := d.Find("JavaScript"); hasJS {
		*issues = append(*issues, ValidationIssue{
			Code:    "javascript-names-tree",
			Level:   "error",
			Message: "Document declares /JavaScript names entries; JavaScript actions are forbidden (spec §3.4)",
		})
	}
}

func inspectActionDict(ctx *model.Context, d pdfTypes.Dict, subtype string, issues *[]ValidationIssue) {
	_, hasJS := d.Find("JS")
	if subtype == "JavaScript" || hasJS {
		*issues = append(*issues, ValidationIssue{
			Code:    "javascript-action",
			Level:   "error",
			Message: "Found /Action with subtype /JavaScript or /JS entry (spec §3.4)",
		})
		return
	}

	switch subtype {
	case "Launch":
		*issues = append(*issues, ValidationIssue{
			Code:    "launch-action",
			Level:   "error",
			Message: "Found /Launch action; running external programs is forbidden (spec §3.4)",
		})
	case "ImportData":
		*issues = append(*issues, ValidationIssue{
			Code:    "import-data-action",
			Level:   "error",
			Message: "Found /ImportData action; data import is forbidden (spec §3.4)",
		})
	case "SubmitForm":
		fEntry, _ := d.Find("F")
		target := filespecTargetGo(ctx, fEntry)
		if target == "" || !strings.HasPrefix(strings.ToLower(target), "mailto:") {
			msg := "Found /SubmitForm action with no inspectable target (spec §3.4)"
			if target != "" {
				msg = fmt.Sprintf("/SubmitForm action targets non-mailto URI %q (spec §3.4)", target)
			}
			*issues = append(*issues, ValidationIssue{
				Code:    "submit-form-external",
				Level:   "error",
				Message: msg,
			})
		}
	}
}

func inspectFilespecDict(d pdfTypes.Dict, issues *[]ValidationIssue) {
	if _, ok := d.Find("EF"); ok {
		return
	}
	target := filespecTargetGo(nil, d)
	msg := "External /Filespec with no /EF (spec §3.4)"
	if target != "" {
		msg = fmt.Sprintf("External /Filespec %q (spec §3.4)", target)
	}
	*issues = append(*issues, ValidationIssue{
		Code:    "external-filespec",
		Level:   "error",
		Message: msg,
		Payload: target,
	})
}

func filespecTargetGo(ctx *model.Context, value pdfTypes.Object) string {
	resolved := value
	if ctx != nil {
		if ref, ok := value.(pdfTypes.IndirectRef); ok {
			obj, err := ctx.Dereference(ref)
			if err == nil {
				resolved = obj
			}
		}
	}
	switch v := resolved.(type) {
	case pdfTypes.StringLiteral:
		return decodePDFTextString(decodePDFString(string(v)))
	case pdfTypes.HexLiteral:
		bs, err := v.Bytes()
		if err == nil {
			return decodePDFTextString(string(bs))
		}
	case pdfTypes.Dict:
		for _, key := range []string{"UF", "F"} {
			if entry, ok := v.Find(key); ok {
				if got := filespecTargetGo(ctx, entry); got != "" {
					return got
				}
			}
		}
	}
	return ""
}

func nameOfEntry(d pdfTypes.Dict, key string) string {
	v, ok := d.Find(key)
	if !ok {
		return ""
	}
	if n, ok := v.(pdfTypes.Name); ok {
		return string(n)
	}
	return ""
}

func dedupeIssues(in []ValidationIssue) []ValidationIssue {
	seen := map[string]struct{}{}
	out := make([]ValidationIssue, 0, len(in))
	for _, i := range in {
		key := i.Code + "\x1f" + i.Payload + "\x1f" + i.Message
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, i)
	}
	return out
}
