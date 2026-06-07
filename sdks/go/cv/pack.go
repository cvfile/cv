package cv

import (
	"bytes"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	pdfTypes "github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// Pack builds a .cv file from the input PDF and one or more representations.
//
// The writer attaches each representation (markdown, html, json, embeddings, or
// caller-supplied payloads) as a PDF/A-3 Associated File: it builds an
// EmbeddedFile stream and a /Filespec dict per payload, wires them into the
// catalog /AF array AND the EmbeddedFiles name tree (both are required: /AF is
// what the cv reader walks, the name tree is what generic PDF tools list), and
// writes the cv: XMP packet into the catalog /Metadata. Under PDF/A mode
// (PackInput.PDFA nil or true) it also adds an sRGB GTS_PDFA1 output intent and
// a trailer /ID so the result passes the in-process PDF/A-3u structural check
// (see pdfa.go). All new objects hang off the catalog graph, so pdfcpu's writer
// serializes them rather than dropping them. This mirrors the JS writer
// (packages/sdk-js/src/pack.ts) so the SDKs produce interoperable files.
func Pack(in PackInput) ([]byte, error) {
	if len(in.PDF) == 0 {
		return nil, fmt.Errorf("cv: Pack requires a non-empty input PDF")
	}

	payloads, embeddingSummaries, err := collectPayloads(in)
	if err != nil {
		return nil, err
	}
	if len(payloads) == 0 {
		return nil, fmt.Errorf("cv: Pack requires at least one payload (markdown, html, json, embeddings, or payloads[])")
	}

	primary := in.Metadata.PrimaryPayload
	if primary == "" {
		primary = defaultPrimary(payloads)
	}
	if !containsPayload(payloads, primary) {
		return nil, fmt.Errorf("cv: primaryPayload %q not found among payloads", primary)
	}

	created := in.Metadata.Created
	if created.IsZero() {
		created = time.Now().UTC()
	}
	modified := in.Metadata.Modified
	if modified.IsZero() {
		modified = created
	}

	integrity := buildIntegrity(in.Metadata.Integrity, payloads)

	ctx, err := loadContext(in.PDF)
	if err != nil {
		return nil, fmt.Errorf("cv: Pack could not read input PDF: %w", err)
	}

	// Snapshot the object numbers already present in the input. A full pdfcpu
	// rewrite drops objects that live in the input's object streams (the embedded
	// font program above all, the default in every modern exporter), corrupting
	// the visual layer and PDF/A-3u font embedding. We instead write a PDF
	// increment (ISO 32000 §7.5.6): only our new and modified objects are
	// appended and every original byte is left untouched, so the font survives
	// verbatim. The snapshot identifies what belongs in the increment.
	existingObjs := make(map[int]bool, len(ctx.XRefTable.Table))
	for objNr := range ctx.XRefTable.Table {
		existingObjs[objNr] = true
	}

	if err := attachPayloads(ctx, payloads, created, modified); err != nil {
		return nil, fmt.Errorf("cv: Pack could not attach payloads: %w", err)
	}

	alternates := buildAlternates(payloads, primary, in.Metadata.PrimaryLanguage)
	meta := in.Metadata
	meta.PrimaryPayload = primary
	meta.Created = created
	meta.Modified = modified
	xmp := buildXMP(meta, alternates, integrity, embeddingSummaries)
	if err := setMetadataXML(ctx, xmp); err != nil {
		return nil, fmt.Errorf("cv: Pack could not write XMP metadata: %w", err)
	}

	if in.PDFA == nil || *in.PDFA {
		if err := addPDFAOutputIntent(ctx); err != nil {
			return nil, fmt.Errorf("cv: Pack could not add PDF/A output intent: %w", err)
		}
		if err := setTrailerID(ctx); err != nil {
			return nil, fmt.Errorf("cv: Pack could not set trailer /ID: %w", err)
		}
	}

	// Build the increment: every object we created (number absent from the
	// pre-mutation snapshot) plus the catalog, modified in place to add /AF,
	// /Metadata, /OutputIntents, and /Names. pdfcpu recorded the previous xref
	// offset on ctx.Write.OffsetPrevXRef during the read, so the increment trailer
	// /Prev chains back to the original automatically.
	for objNr := range ctx.XRefTable.Table {
		if !existingObjs[objNr] {
			ctx.Write.IncrementWithObjNr(objNr)
		}
	}
	if ctx.XRefTable.Root != nil {
		ctx.Write.IncrementWithObjNr(ctx.XRefTable.Root.ObjectNumber.Value())
	}
	ctx.Write.Increment = true

	// Force a CLASSIC xref table for the increment rather than an xref stream.
	// The increment's own objects are all top-level (uncompressed), so a classic
	// table is valid, and unlike an xref stream it is followed reliably by every
	// reader, pdf-lib (the JS SDK) included, which must resolve the new /AF
	// filespecs to read the embedded payloads.
	ctx.Configuration.WriteXRefStream = false

	// PDF/A-3u (ISO 19005-3 §6.1.9) requires the first object of the increment to
	// be preceded by an EOL marker. Some producers (pdf-lib among them) end the
	// file at "%%EOF" with no trailing newline, which would butt the appended
	// object number directly against it ("%%EOF18 0 obj"). Separate them with a
	// newline and shift the increment base offset by the same byte so the new
	// xref offsets stay exact.
	rws := newByteRWS(in.PDF)
	offset := ctx.Read.FileSize
	if n := len(in.PDF); n == 0 || in.PDF[n-1] != '\n' {
		rws.buf = append(rws.buf, '\n')
		offset++
	}
	ctx.Write.Offset = offset

	conf := model.NewDefaultConfiguration()
	conf.PostProcessValidate = false
	if err := api.WriteIncr(ctx, rws, conf); err != nil {
		return nil, fmt.Errorf("cv: Pack could not serialize PDF increment: %w", err)
	}
	return rws.Bytes(), nil
}

// byteRWS is a minimal in-memory io.ReadWriteSeeker. pdfcpu's incremental writer
// seeks to the end of the original bytes and appends the increment there; this
// backs that with a growable slice so packing needs no temp file.
type byteRWS struct {
	buf []byte
	pos int64
}

func newByteRWS(initial []byte) *byteRWS {
	b := make([]byte, len(initial))
	copy(b, initial)
	return &byteRWS{buf: b}
}

// Bytes returns the full backing buffer (original bytes plus appended increment).
func (b *byteRWS) Bytes() []byte { return b.buf }

func (b *byteRWS) Read(p []byte) (int, error) {
	if b.pos >= int64(len(b.buf)) {
		return 0, io.EOF
	}
	n := copy(p, b.buf[b.pos:])
	b.pos += int64(n)
	return n, nil
}

func (b *byteRWS) Write(p []byte) (int, error) {
	if end := b.pos + int64(len(p)); end > int64(len(b.buf)) {
		grown := make([]byte, end)
		copy(grown, b.buf)
		b.buf = grown
	}
	n := copy(b.buf[b.pos:], p)
	b.pos += int64(n)
	return n, nil
}

func (b *byteRWS) Seek(offset int64, whence int) (int64, error) {
	var abs int64
	switch whence {
	case io.SeekStart:
		abs = offset
	case io.SeekCurrent:
		abs = b.pos + offset
	case io.SeekEnd:
		abs = int64(len(b.buf)) + offset
	default:
		return 0, fmt.Errorf("byteRWS: invalid whence %d", whence)
	}
	if abs < 0 {
		return 0, fmt.Errorf("byteRWS: negative position")
	}
	b.pos = abs
	return abs, nil
}

// collectPayloads turns the PackInput representations into the ordered payload
// list plus the embedding-space summaries recorded in XMP. Order matches the JS
// writer: markdown, html, json, embeddings, then caller-supplied payloads.
func collectPayloads(in PackInput) ([]Payload, []EmbeddingSpaceSummary, error) {
	var out []Payload
	if in.Markdown != nil {
		out = append(out, Payload{
			Data:         in.Markdown,
			Name:         NameMarkdown,
			MimeType:     MimeMarkdown,
			Relationship: RelAlternative,
		})
	}
	if in.HTML != nil {
		out = append(out, Payload{
			Data:         in.HTML,
			Name:         NameHTML,
			MimeType:     MimeHTML,
			Relationship: RelAlternative,
		})
	}
	if in.JSON != nil {
		b, err := json.MarshalIndent(in.JSON, "", "  ")
		if err != nil {
			return nil, nil, fmt.Errorf("cv: Pack could not encode JSON payload: %w", err)
		}
		out = append(out, Payload{
			Data:         b,
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

	seen := map[string]struct{}{}
	for _, p := range out {
		if err := assertPortableName(p.Name); err != nil {
			return nil, nil, err
		}
		if _, dup := seen[p.Name]; dup {
			return nil, nil, fmt.Errorf("cv: duplicate payload name %q", p.Name)
		}
		seen[p.Name] = struct{}{}
	}

	// The embedding summaries live in PackInput.Metadata.Embeddings when the
	// caller has pre-encoded the CBOR; surface them so XMP records them.
	return out, in.Metadata.Embeddings, nil
}

// buildIntegrity computes per-payload sha-256 digests unless integrity is "none".
func buildIntegrity(mode string, payloads []Payload) []IntegrityEntry {
	if mode == "none" {
		return nil
	}
	out := make([]IntegrityEntry, 0, len(payloads))
	for _, p := range payloads {
		sum := sha256.Sum256(p.Data)
		out = append(out, IntegrityEntry{
			Payload:   p.Name,
			Algorithm: "sha-256",
			Digest:    hex.EncodeToString(sum[:]),
		})
	}
	return out
}

// buildAlternates records every Alternative payload other than the primary, so
// readers can pick a representation in the right language without re-parsing.
func buildAlternates(payloads []Payload, primary, primaryLanguage string) []AlternateMeta {
	var out []AlternateMeta
	for _, p := range payloads {
		if p.Name == primary {
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
		out = append(out, AlternateMeta{Payload: p.Name, Language: lang, MimeType: p.MimeType})
	}
	return out
}

// attachPayloads wires each payload into the document as a PDF/A-3 Associated
// File. For each payload it builds the EmbeddedFile stream (carrying the MIME
// /Subtype and the spec-mandated MD5 /CheckSum on /Params, ISO 19005-3 §4.1) and
// the /Filespec (carrying /AFRelationship and the MIME /Subtype), registers both
// as indirect objects, appends the filespec to the catalog /AF array, and adds
// it to the EmbeddedFiles name tree.
func attachPayloads(ctx *model.Context, payloads []Payload, created, modified time.Time) error {
	xref := ctx.XRefTable
	if err := xref.LocateNameTree("EmbeddedFiles", true); err != nil {
		return err
	}
	catalog, err := xref.Catalog()
	if err != nil {
		return err
	}

	var afArray pdfTypes.Array
	for _, p := range payloads {
		filespecRef, err := buildFilespec(ctx, p, created, modified)
		if err != nil {
			return err
		}
		if err := xref.Names["EmbeddedFiles"].Add(
			xref, p.Name, *filespecRef,
			model.NameMap{}, []string{"F", "UF"},
		); err != nil {
			return err
		}
		afArray = append(afArray, *filespecRef)
	}
	catalog.Update("AF", afArray)
	return nil
}

// buildFilespec creates the EmbeddedFile stream and /Filespec for one payload and
// returns an indirect reference to the filespec dict.
func buildFilespec(ctx *model.Context, p Payload, created, modified time.Time) (*pdfTypes.IndirectRef, error) {
	xref := ctx.XRefTable

	streamRef, err := xref.NewEmbeddedStreamDict(bytes.NewReader(p.Data), modified)
	if err != nil {
		return nil, err
	}
	streamDict, _, err := xref.DereferenceStreamDict(*streamRef)
	if err != nil {
		return nil, err
	}
	mime := p.MimeType
	if mime == "" {
		mime = "application/octet-stream"
	}
	streamDict.InsertName("Subtype", mime)
	// ISO 19005-3 §4.1: each embedded file's /Params carries an MD5 /CheckSum over
	// the unwrapped bytes plus creation/modification dates. NewEmbeddedStreamDict
	// already set /Params /Size and /ModDate; amend with /CheckSum and /CreationDate.
	if params := streamDict.DictEntry("Params"); params != nil {
		sum := md5.Sum(p.Data)
		params.Insert("CheckSum", pdfTypes.HexLiteral(hex.EncodeToString(sum[:])))
		params.Insert("CreationDate", pdfTypes.StringLiteral(pdfTypes.DateString(created)))
	}

	desc := p.Description
	if desc == "" {
		desc = defaultDescription(p)
	}
	filespec, err := xref.NewFileSpecDict(p.Name, p.Name, desc, *streamRef)
	if err != nil {
		return nil, err
	}
	// pdfcpu's NewFileSpecDict force-encodes both /F and /UF as UTF-16BE wrapped
	// in a *literal* string, e.g. (þÿ\0r\0e\0s\0u\0m\0e\0.\0m\0d). A literal PDF
	// string carries no BOM-detection contract, so conformant readers that decode
	// /UF as text (pd-lib's filespec reader among them) see mojibake and the
	// payload-name lookup fails. Our payload names are guaranteed POSIX-portable
	// ASCII (assertPortableName, spec §4.4), so we rewrite both entries in the
	// textbook-correct PDF form (ISO 32000 §7.11.2): /F as the portable
	// PDFDocEncoded literal, /UF as a UTF-16BE *hex* string whose leading FEFF BOM
	// every conformant reader decodes back to the exact name.
	filespec.Update("F", pdfTypes.StringLiteral(p.Name))
	filespec.Update("UF", pdfTypes.NewHexLiteral([]byte(pdfTypes.EncodeUTF16String(p.Name))))

	rel := p.Relationship
	if rel != RelAlternative && rel != RelData && rel != RelSupplement {
		rel = RelAlternative
	}
	filespec.InsertName("AFRelationship", string(rel))
	filespec.InsertName("Subtype", mime)

	return xref.IndRefForNewObject(filespec)
}

// setMetadataXML installs the XMP packet as the catalog's /Metadata stream. The
// stream is written uncompressed (no filter) because PDF/A requires the metadata
// stream to be plainly readable (ISO 19005-3 §6.7.3).
func setMetadataXML(ctx *model.Context, xmp string) error {
	xref := ctx.XRefTable
	catalog, err := xref.Catalog()
	if err != nil {
		return err
	}

	sd := pdfTypes.StreamDict{
		Dict:    pdfTypes.NewDict(),
		Content: []byte(xmp),
		// No FilterPipeline: Encode keeps the packet uncompressed and sets Raw,
		// StreamLength, and /Length so the writer can serialize it.
		FilterPipeline: nil,
	}
	sd.InsertName("Type", "Metadata")
	sd.InsertName("Subtype", "XML")
	if err := sd.Encode(); err != nil {
		return err
	}

	ref, err := xref.IndRefForNewObject(sd)
	if err != nil {
		return err
	}
	catalog.Update("Metadata", *ref)
	return nil
}

// addPDFAOutputIntent adds an sRGB GTS_PDFA1 output intent unless one is already
// present, satisfying PDF/A §6.2.2 for files that use device-dependent colour.
func addPDFAOutputIntent(ctx *model.Context) error {
	xref := ctx.XRefTable
	catalog, err := xref.Catalog()
	if err != nil {
		return err
	}
	if existing, found := catalog.Find("OutputIntents"); found {
		if arr, _ := xref.DereferenceArray(existing); len(arr) > 0 {
			return nil
		}
	}

	icc := srgbICCProfile()
	iccStream := pdfTypes.StreamDict{
		Dict:    pdfTypes.NewDict(),
		Content: icc,
		// Uncompressed: Encode sets Raw, StreamLength, and /Length.
		FilterPipeline: nil,
	}
	iccStream.InsertInt("N", SRGBICCComponents)
	if err := iccStream.Encode(); err != nil {
		return err
	}
	iccRef, err := xref.IndRefForNewObject(iccStream)
	if err != nil {
		return err
	}

	intent := pdfTypes.NewDict()
	intent.InsertName("Type", "OutputIntent")
	intent.InsertName("S", "GTS_PDFA1")
	intent.InsertString("OutputConditionIdentifier", SRGBICCVersion)
	intent.InsertString("Info", SRGBICCVersion)
	intent.InsertString("RegistryName", "http://www.color.org")
	intent.Insert("DestOutputProfile", *iccRef)

	catalog.Update("OutputIntents", pdfTypes.Array{intent})
	return nil
}

// setTrailerID writes a 16-byte file identifier into the trailer /ID, required by
// PDF/A §6.1.3. Both array elements are the same value, matching the JS writer.
func setTrailerID(ctx *model.Context) error {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return err
	}
	id := pdfTypes.HexLiteral(hex.EncodeToString(buf))
	ctx.ID = pdfTypes.Array{id, id}
	return nil
}

func containsPayload(payloads []Payload, name string) bool {
	for _, p := range payloads {
		if p.Name == name {
			return true
		}
	}
	return false
}

// defaultPrimary picks the canonical text payload: markdown, then html, then the
// first Alternative, then the first payload overall.
func defaultPrimary(payloads []Payload) string {
	if containsPayload(payloads, NameMarkdown) {
		return NameMarkdown
	}
	if containsPayload(payloads, NameHTML) {
		return NameHTML
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

// portableNameByte reports whether b is in the POSIX-portable filename charset
// allowed by spec §4.4: [A-Za-z0-9._/-].
func portableNameByte(b byte) bool {
	switch {
	case b >= 'A' && b <= 'Z',
		b >= 'a' && b <= 'z',
		b >= '0' && b <= '9',
		b == '.', b == '_', b == '/', b == '-':
		return true
	}
	return false
}

// assertPortableName rejects payload names outside the POSIX-portable charset or
// containing "." / ".." path segments (path-traversal guard), per spec §4.4.
func assertPortableName(name string) error {
	if name == "" {
		return fmt.Errorf("cv: payload name is empty (spec §4.4)")
	}
	for i := 0; i < len(name); i++ {
		if !portableNameByte(name[i]) {
			return fmt.Errorf("cv: payload name %q is not POSIX-portable; allowed charset is [A-Za-z0-9._/-] (spec §4.4)", name)
		}
	}
	start := 0
	for i := 0; i <= len(name); i++ {
		if i == len(name) || name[i] == '/' {
			seg := name[start:i]
			if seg == "." || seg == ".." {
				return fmt.Errorf("cv: payload name %q contains a %q path segment (spec §4.4)", name, seg)
			}
			start = i + 1
		}
	}
	return nil
}
