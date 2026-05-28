package cvdetector

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func fixturePath(t *testing.T) string {
	t.Helper()
	_, here, _, _ := runtime.Caller(0)
	p := filepath.Join(filepath.Dir(here), "..", "..", "..", "packages", "sdk-js", "tests", "fixtures", "python-produced.cv")
	if _, err := os.Stat(p); err != nil {
		t.Skipf("fixture not found at %s", p)
	}
	return p
}

func TestDetectRecognisesCVFile(t *testing.T) {
	data, err := os.ReadFile(fixturePath(t))
	if err != nil {
		t.Fatal(err)
	}
	det := Detect(data)
	if !det.IsCvFile {
		t.Fatal("expected IsCvFile=true")
	}
	if det.Version == "" {
		t.Error("expected non-empty Version")
	}
	if det.PrimaryPayload != "resume.md" {
		t.Errorf("PrimaryPayload = %q, want resume.md", det.PrimaryPayload)
	}
	if det.PrimaryLanguage == "" {
		t.Error("expected non-empty PrimaryLanguage")
	}
}

func TestDetectRejectsPlainPDF(t *testing.T) {
	plain := []byte("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\n%%EOF")
	det := Detect(plain)
	if det.IsCvFile {
		t.Fatal("expected IsCvFile=false for plain PDF")
	}
}

func TestDetectRejectsGarbage(t *testing.T) {
	det := Detect([]byte("hello world"))
	if det.IsCvFile {
		t.Fatal("expected IsCvFile=false for non-PDF")
	}
}

func TestDetectAttributeFormXMP(t *testing.T) {
	// RDF attribute-form serialisation: fields are attributes on the
	// rdf:Description element rather than child elements.
	xmp := `%PDF-1.7
<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:cv="http://ns.cvfile.org/cv/1.0/"
  cv:version="1.0"
  cv:primaryPayload="resume.md"
  cv:primaryLanguage="en"
  cv:generator="cvfile.org/create"/>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
%%EOF`
	det := Detect([]byte(xmp))
	if !det.IsCvFile {
		t.Fatal("expected IsCvFile=true for attribute-form XMP")
	}
	if det.Version != "1.0" {
		t.Errorf("Version = %q, want 1.0", det.Version)
	}
	if det.PrimaryPayload != "resume.md" {
		t.Errorf("PrimaryPayload = %q, want resume.md", det.PrimaryPayload)
	}
	if det.PrimaryLanguage != "en" {
		t.Errorf("PrimaryLanguage = %q, want en", det.PrimaryLanguage)
	}
	if det.Generator != "cvfile.org/create" {
		t.Errorf("Generator = %q, want cvfile.org/create", det.Generator)
	}
}

func TestUnwrapReturnsPrimaryMarkdown(t *testing.T) {
	data, err := os.ReadFile(fixturePath(t))
	if err != nil {
		t.Fatal(err)
	}
	payload, err := Unwrap(data, "")
	if err != nil {
		t.Fatal(err)
	}
	if payload == nil {
		t.Fatal("expected non-nil payload")
	}
	if payload.Name != "resume.md" {
		t.Errorf("Name = %q, want resume.md", payload.Name)
	}
	if payload.MimeType != "text/markdown" {
		t.Errorf("MimeType = %q, want text/markdown", payload.MimeType)
	}
	if len(payload.Bytes) == 0 {
		t.Error("expected non-empty payload bytes")
	}
}

func TestUnwrapSpecificPayload(t *testing.T) {
	data, _ := os.ReadFile(fixturePath(t))
	payload, err := Unwrap(data, "resume.html")
	if err != nil {
		t.Fatal(err)
	}
	if payload == nil || payload.Name != "resume.html" {
		t.Fatalf("expected resume.html, got %+v", payload)
	}
	if payload.MimeType != "text/html" {
		t.Errorf("MimeType = %q, want text/html", payload.MimeType)
	}
}

func TestUnwrapMissingPayloadReturnsNil(t *testing.T) {
	data, _ := os.ReadFile(fixturePath(t))
	payload, err := Unwrap(data, "does-not-exist.txt")
	if err != nil {
		t.Fatal(err)
	}
	if payload != nil {
		t.Errorf("expected nil payload, got %+v", payload)
	}
}

func TestUnwrapNonCVReturnsNil(t *testing.T) {
	payload, err := Unwrap([]byte("%PDF-1.7\n%%EOF"), "")
	if err != nil {
		t.Fatal(err)
	}
	if payload != nil {
		t.Errorf("expected nil payload for non-cv input")
	}
}
