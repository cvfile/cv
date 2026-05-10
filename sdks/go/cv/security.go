package cv

import (
	"fmt"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	pdfTypes "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// scanForbiddenConstructs walks every indirect object in the xref table and
// reports constructs prohibited by .cv spec §3.4. Error codes match the JS
// and Python SDKs so cross-language tests share expectations.
func scanForbiddenConstructs(ctx *model.Context) []ValidationIssue {
	var issues []ValidationIssue

	if ctx.Encrypt != nil {
		issues = append(issues, ValidationIssue{
			Code:    "encrypted-document",
			Level:   "error",
			Message: "Trailer declares /Encrypt; encryption is forbidden in cv 0.x (spec §3.4)",
		})
	}

	for _, entry := range ctx.Table {
		if entry == nil || entry.Object == nil {
			continue
		}
		dict, ok := entry.Object.(pdfTypes.Dict)
		if !ok {
			if sd, isStream := entry.Object.(pdfTypes.StreamDict); isStream {
				dict = sd.Dict
			} else {
				continue
			}
		}
		inspectSecurityDict(ctx, dict, &issues)
	}

	return dedupeIssues(issues)
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
