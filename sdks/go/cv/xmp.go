package cv

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// xmpBegin contains a Unicode BOM (U+FEFF) inside the begin attribute, as
// required by the XMP packet wrapper. We construct it programmatically because
// Go forbids a literal BOM in the middle of source code.
var xmpBegin = "<?xpacket begin=\"" + string(rune(0xFEFF)) + "\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>"

const xmpEnd = `<?xpacket end="w"?>`

func buildXMP(meta Metadata, alternates []AlternateMeta, integrity []IntegrityEntry, embeddings []EmbeddingSpaceSummary) string {
	created := meta.Created
	modified := meta.Modified
	if modified.IsZero() {
		modified = created
	}
	generator := meta.Generator
	if generator == "" {
		generator = DefaultGenerator
	}

	createdStr := isoTime(created)
	modifiedStr := isoTime(modified)

	altBlock := ""
	if len(alternates) > 0 {
		b, _ := json.Marshal(alternates)
		altBlock = fmt.Sprintf("\n      <cv:alternates>%s</cv:alternates>", xmlEscape(string(b)))
	}
	intBlock := ""
	if len(integrity) > 0 {
		b, _ := json.Marshal(integrity)
		intBlock = fmt.Sprintf("\n      <cv:integrity>%s</cv:integrity>", xmlEscape(string(b)))
	}
	embBlock := ""
	if len(embeddings) > 0 {
		b, _ := json.Marshal(embeddings)
		embBlock = fmt.Sprintf("\n      <cv:embeddings>%s</cv:embeddings>", xmlEscape(string(b)))
	}

	return fmt.Sprintf(`%s
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="cv-go %s">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>U</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:format>application/pdf</dc:format>
    </rdf:Description>
    <rdf:Description rdf:about=""
      xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreateDate>%s</xmp:CreateDate>
      <xmp:ModifyDate>%s</xmp:ModifyDate>
      <xmp:CreatorTool>%s</xmp:CreatorTool>
    </rdf:Description>
    <rdf:Description rdf:about=""
      xmlns:cv="%s">
      <cv:version>%s</cv:version>
      <cv:created>%s</cv:created>
      <cv:modified>%s</cv:modified>
      <cv:primaryLanguage>%s</cv:primaryLanguage>
      <cv:primaryPayload>%s</cv:primaryPayload>
      <cv:generator>%s</cv:generator>%s%s%s
    </rdf:Description>
%s
  </rdf:RDF>
</x:xmpmeta>
%s`,
		xmpBegin,
		xmlEscape(SpecVersion),
		xmlEscape(createdStr), xmlEscape(modifiedStr), xmlEscape(generator),
		NamespaceURI,
		xmlEscape(SpecVersion),
		xmlEscape(createdStr), xmlEscape(modifiedStr),
		xmlEscape(meta.PrimaryLanguage),
		xmlEscape(meta.PrimaryPayload),
		xmlEscape(generator),
		altBlock, intBlock, embBlock,
		extensionSchema(),
		xmpEnd,
	)
}

func extensionSchema() string {
	props := []struct{ Name, Type, Desc string }{
		{"version", "Text", "cvfile.org format version (MAJOR.MINOR)"},
		{"created", "Date", "When the .cv file was created"},
		{"modified", "Date", "When the .cv file was last modified"},
		{"primaryLanguage", "Text", "BCP-47 tag of the canonical content language"},
		{"primaryPayload", "Text", "Filename of the canonical text payload"},
		{"generator", "Text", "Identifier of the producer"},
		{"alternates", "Text", "Alternate payload descriptors (JSON-encoded array)"},
		{"integrity", "Text", "Per-payload digest entries (JSON-encoded array)"},
		{"embeddings", "Text", "Embedding-space summaries (JSON-encoded array)"},
	}
	var b strings.Builder
	for _, p := range props {
		fmt.Fprintf(&b,
			`                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>%s</pdfaProperty:name>
                  <pdfaProperty:valueType>%s</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>%s</pdfaProperty:description>
                </rdf:li>
`, p.Name, p.Type, xmlEscape(p.Desc))
	}
	return fmt.Sprintf(`    <rdf:Description rdf:about=""
      xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
      xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
      xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:namespaceURI>%s</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>cv</pdfaSchema:prefix>
            <pdfaSchema:schema>cvfile.org cv namespace</pdfaSchema:schema>
            <pdfaSchema:property>
              <rdf:Seq>
%s              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>`, NamespaceURI, b.String())
}

func parseXMP(xml string) (*Metadata, bool) {
	version, ok := innerCv(xml, "version")
	if !ok {
		return nil, false
	}
	primaryLanguage, ok := innerCv(xml, "primaryLanguage")
	if !ok {
		return nil, false
	}
	primaryPayload, ok := innerCv(xml, "primaryPayload")
	if !ok {
		return nil, false
	}
	created, _ := innerCv(xml, "created")
	modified, _ := innerCv(xml, "modified")
	generator, _ := innerCv(xml, "generator")

	meta := Metadata{
		Version:         version,
		PrimaryLanguage: primaryLanguage,
		PrimaryPayload:  primaryPayload,
		Generator:       generator,
	}
	if t, err := time.Parse(time.RFC3339, created); err == nil {
		meta.Created = t
	}
	if t, err := time.Parse(time.RFC3339, modified); err == nil {
		meta.Modified = t
	}
	if raw, ok := innerCv(xml, "alternates"); ok {
		_ = json.Unmarshal([]byte(raw), &meta.Alternates)
	}
	if raw, ok := innerCv(xml, "integrity"); ok {
		_ = json.Unmarshal([]byte(raw), &meta.IntegrityList)
	}
	if raw, ok := innerCv(xml, "embeddings"); ok {
		_ = json.Unmarshal([]byte(raw), &meta.Embeddings)
	}
	return &meta, true
}

var innerCvRe = regexp.MustCompile(`(?s)<cv:([A-Za-z]+)>(.*?)</cv:[A-Za-z]+>`)

func innerCv(xml, tag string) (string, bool) {
	re := regexp.MustCompile(fmt.Sprintf(`(?s)<cv:%s>(.*?)</cv:%s>`, regexp.QuoteMeta(tag), regexp.QuoteMeta(tag)))
	m := re.FindStringSubmatch(xml)
	if m == nil {
		return "", false
	}
	return xmlUnescape(strings.TrimSpace(m[1])), true
}

func xmlEscape(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	)
	return r.Replace(s)
}

func xmlUnescape(s string) string {
	r := strings.NewReplacer(
		"&apos;", "'",
		"&quot;", `"`,
		"&gt;", ">",
		"&lt;", "<",
		"&amp;", "&",
	)
	return r.Replace(s)
}

func isoTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05Z")
}
