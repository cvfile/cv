package cv

import "strings"

// IsCvFile returns true if the bytes look like a valid .cv file.
func IsCvFile(data []byte) bool {
	if len(data) < 4 || string(data[:4]) != "%PDF" {
		return false
	}
	ctx, err := loadContext(data)
	if err != nil {
		return false
	}
	xml, err := readMetadataXML(ctx)
	if err != nil || xml == "" {
		return false
	}
	return strings.Contains(xml, NamespaceURI)
}
