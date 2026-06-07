// Command cv is the canonical command-line interface for the .cv open file
// format. It ships the reader path (extract / inspect / validate / search) and
// the writer (pack), all backed by the cv Go SDK.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	cv "github.com/cvfile/cv/sdks/go/cv"
)

// cliVersion is the version of this command-line tool, distinct from the
// .cv spec version (cv.SpecVersion) and any SDK package version.
const cliVersion = "0.2.0"

const usage = `cv — the .cv open file format CLI

Usage:
  cv pack    --pdf <file.pdf> -o <out.cv> [--md <f>] [--html <f>] [--json <f>]
             [--lang <bcp47>] [--primary <name>] [--embeddings <f>]
  cv extract <file.cv> [--format pdf|md|html]   (--format defaults to pdf)
  cv inspect <file.cv> [--json]
  cv validate <file.cv> [--strict]
  cv search  <file.cv> "<query>" [--k 5] [--model BAAI/bge-m3]
  cv version
  cv help

Notes:
  cv pack wraps an input PDF plus one or more text representations (markdown,
  html, json) into a .cv. At least one of --md / --html / --json is required.

  cv search calls the Hugging Face Inference API to embed the query in the
  same model space the file was packed with. Set HF_TOKEN in the env.
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(64)
	}

	args := os.Args[1:]
	cmd := args[0]
	rest := args[1:]

	switch cmd {
	case "pack":
		os.Exit(cmdPack(rest))
	case "extract":
		os.Exit(cmdExtract(rest))
	case "inspect":
		os.Exit(cmdInspect(rest))
	case "validate":
		os.Exit(cmdValidate(rest))
	case "search":
		os.Exit(cmdSearch(rest))
	case "version", "--version", "-v":
		fmt.Printf("cv %s (spec %s)\n", cliVersion, cv.SpecVersion)
	case "help", "--help", "-h":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n\n%s", cmd, usage)
		os.Exit(64)
	}
}

// cmdPack reads an input PDF plus one or more text representations and writes a
// .cv to --out. Flags mirror cv.PackInput. Exit codes follow the rest of the
// CLI: 64 usage error, 66 file-read error, 65 pack failure, 1 write failure.
func cmdPack(args []string) int {
	var pdfPath, mdPath, htmlPath, jsonPath, embPath, lang, primary, outPath string
	for i := 0; i < len(args); i++ {
		next := func() (string, bool) {
			if i+1 < len(args) {
				i++
				return args[i], true
			}
			return "", false
		}
		var ok bool
		switch args[i] {
		case "--pdf":
			pdfPath, ok = next()
		case "--md", "--markdown":
			mdPath, ok = next()
		case "--html":
			htmlPath, ok = next()
		case "--json":
			jsonPath, ok = next()
		case "--embeddings":
			embPath, ok = next()
		case "--lang":
			lang, ok = next()
		case "--primary":
			primary, ok = next()
		case "-o", "--out":
			outPath, ok = next()
		default:
			fmt.Fprintf(os.Stderr, "pack: unknown flag %q\n", args[i])
			return 64
		}
		if !ok {
			fmt.Fprintf(os.Stderr, "pack: flag %q needs a value\n", args[i])
			return 64
		}
	}

	if pdfPath == "" {
		fmt.Fprintln(os.Stderr, "pack: --pdf <file.pdf> is required")
		return 64
	}
	if outPath == "" {
		fmt.Fprintln(os.Stderr, "pack: -o/--out <file.cv> is required")
		return 64
	}
	if mdPath == "" && htmlPath == "" && jsonPath == "" {
		fmt.Fprintln(os.Stderr, "pack: at least one of --md / --html / --json is required")
		return 64
	}

	in := cv.PackInput{Metadata: cv.Metadata{PrimaryLanguage: lang, PrimaryPayload: primary}}

	pdf, err := os.ReadFile(pdfPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", pdfPath, err)
		return 66
	}
	in.PDF = pdf

	for _, f := range []struct {
		path string
		dst  *[]byte
	}{
		{mdPath, &in.Markdown},
		{htmlPath, &in.HTML},
		{embPath, &in.Embeddings},
	} {
		if f.path == "" {
			continue
		}
		b, err := os.ReadFile(f.path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "read %s: %v\n", f.path, err)
			return 66
		}
		*f.dst = b
	}

	if jsonPath != "" {
		b, err := os.ReadFile(jsonPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "read %s: %v\n", jsonPath, err)
			return 66
		}
		var parsed any
		if err := json.Unmarshal(b, &parsed); err != nil {
			fmt.Fprintf(os.Stderr, "pack: %s is not valid JSON: %v\n", jsonPath, err)
			return 65
		}
		in.JSON = parsed
	}

	out, err := cv.Pack(in)
	if err != nil {
		fmt.Fprintf(os.Stderr, "pack: %v\n", err)
		return 65
	}
	if err := os.WriteFile(outPath, out, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", outPath, err)
		return 1
	}
	fmt.Fprintf(os.Stderr, "packed %d bytes to %s\n", len(out), outPath)
	return 0
}

func cmdExtract(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "extract: missing <file.cv>")
		return 64
	}
	path := args[0]
	format := "pdf"
	for i := 1; i < len(args); i++ {
		if args[i] == "--format" && i+1 < len(args) {
			format = args[i+1]
			i++
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", path, err)
		return 66
	}
	switch format {
	case "md", "markdown":
		md, err := cv.ExtractMarkdown(data, "")
		if err != nil {
			fmt.Fprintf(os.Stderr, "extract markdown: %v\n", err)
			return 65
		}
		fmt.Print(md)
	case "html":
		html, err := cv.ExtractHTML(data, "")
		if err != nil {
			fmt.Fprintf(os.Stderr, "extract html: %v\n", err)
			return 65
		}
		fmt.Print(html)
	case "pdf":
		_, err := os.Stdout.Write(data)
		if err != nil {
			fmt.Fprintf(os.Stderr, "write: %v\n", err)
			return 1
		}
	default:
		fmt.Fprintf(os.Stderr, "extract: unknown format %q (try: md, html, pdf)\n", format)
		return 64
	}
	return 0
}

func cmdInspect(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "inspect: missing <file.cv>")
		return 64
	}
	path := args[0]
	jsonOut := false
	for _, a := range args[1:] {
		if a == "--json" {
			jsonOut = true
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", path, err)
		return 66
	}
	meta, err := cv.Inspect(data)
	if err != nil {
		fmt.Fprintf(os.Stderr, "inspect: %v\n", err)
		return 65
	}
	if jsonOut {
		out, _ := json.MarshalIndent(meta, "", "  ")
		fmt.Println(string(out))
		return 0
	}
	fmt.Printf("cv:version       %s\n", meta.Version)
	fmt.Printf("primaryLanguage  %s\n", meta.PrimaryLanguage)
	fmt.Printf("primaryPayload   %s\n", meta.PrimaryPayload)
	if meta.Generator != "" {
		fmt.Printf("generator        %s\n", meta.Generator)
	}
	if !meta.Created.IsZero() {
		fmt.Printf("created          %s\n", meta.Created.Format("2006-01-02T15:04:05Z"))
	}
	if !meta.Modified.IsZero() {
		fmt.Printf("modified         %s\n", meta.Modified.Format("2006-01-02T15:04:05Z"))
	}
	fmt.Printf("alternates       %d\n", len(meta.Alternates))
	fmt.Printf("integrity items  %d\n", len(meta.IntegrityList))
	fmt.Printf("embeddings       %d\n", len(meta.Embeddings))
	for _, e := range meta.Embeddings {
		fmt.Printf("  - %s dim=%d metric=%s chunks=%d\n", e.Model, e.Dimension, e.Metric, e.Chunks)
	}
	return 0
}

func cmdValidate(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "validate: missing <file.cv>")
		return 64
	}
	path := args[0]
	strict := false
	for _, a := range args[1:] {
		if a == "--strict" {
			strict = true
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", path, err)
		return 66
	}
	report := cv.Validate(data, cv.ValidateOptions{Strict: strict})
	verdict := "PASS"
	if !report.OK {
		verdict = "FAIL"
	}
	fmt.Printf("%s %s (%s, %d issues)\n", verdict, path, report.Level, len(report.Issues))
	for _, i := range report.Issues {
		fmt.Printf("  [%s] %s: %s\n", i.Level, i.Code, i.Message)
	}
	if !report.OK {
		return 65
	}
	return 0
}

func cmdSearch(args []string) int {
	if len(args) < 2 {
		fmt.Fprintln(os.Stderr, "search: usage: cv search <file.cv> \"<query>\" [--k 5] [--model BAAI/bge-m3]")
		return 64
	}
	path := args[0]
	query := args[1]
	k := 5
	modelOverride := ""
	for i := 2; i < len(args); i++ {
		switch args[i] {
		case "--k":
			if i+1 < len(args) {
				if v, err := strconvAtoi(args[i+1]); err == nil {
					k = v
				}
				i++
			}
		case "--model":
			if i+1 < len(args) {
				modelOverride = args[i+1]
				i++
			}
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", path, err)
		return 66
	}
	cborBytes, err := cv.ExtractEmbeddings(data)
	if err != nil {
		fmt.Fprintf(os.Stderr, "extract embeddings: %v\n", err)
		return 65
	}
	if len(cborBytes) == 0 {
		fmt.Fprintln(os.Stderr, "search: this .cv has no embeddings.cbor payload")
		return 66
	}
	payload, err := cv.DecodeEmbeddings(cborBytes)
	if err != nil {
		fmt.Fprintf(os.Stderr, "decode embeddings: %v\n", err)
		return 65
	}

	// Pick the space we'll query: explicit override wins, otherwise the first.
	space := payload.Spaces[0]
	if modelOverride != "" {
		found := false
		for _, s := range payload.Spaces {
			if s.Model == modelOverride {
				space = s
				found = true
				break
			}
		}
		if !found {
			fmt.Fprintf(os.Stderr, "search: no space matches model %q\n", modelOverride)
			return 65
		}
	}

	client, err := cv.NewHuggingFaceClient(space.Model, "")
	if err != nil {
		fmt.Fprintf(os.Stderr, "search: %v\n", err)
		return 65
	}
	matrix, err := client.EmbedTexts([]string{query})
	if err != nil {
		fmt.Fprintf(os.Stderr, "embed query: %v\n", err)
		return 65
	}
	hits, err := cv.SearchSemantic(payload, matrix[0], cv.SearchOptions{Model: space.Model, K: k})
	if err != nil {
		fmt.Fprintf(os.Stderr, "search: %v\n", err)
		return 65
	}

	mdSrc, _ := cv.ExtractMarkdown(data, "")
	for i, h := range hits {
		preview := ""
		if mdSrc != "" && h.TextOffset+h.TextLength <= len(mdSrc) {
			preview = strings.TrimSpace(mdSrc[h.TextOffset : h.TextOffset+h.TextLength])
			preview = oneLine(preview)
			if len(preview) > 80 {
				preview = preview[:77] + "..."
			}
		}
		fmt.Printf("%d. %-20s score=%.4f  %s\n", i+1, h.ChunkID, h.Score, preview)
	}
	return 0
}

func oneLine(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '\n' || c == '\r' || c == '\t' {
			out = append(out, ' ')
		} else {
			out = append(out, c)
		}
	}
	// collapse runs of spaces
	collapsed := make([]byte, 0, len(out))
	prevSpace := false
	for _, b := range out {
		if b == ' ' {
			if prevSpace {
				continue
			}
			prevSpace = true
		} else {
			prevSpace = false
		}
		collapsed = append(collapsed, b)
	}
	return string(collapsed)
}

func strconvAtoi(s string) (int, error) {
	n := 0
	if s == "" {
		return 0, fmt.Errorf("empty")
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("not int")
		}
		n = n*10 + int(c-'0')
	}
	return n, nil
}
