package cv

import "fmt"

// Inspect returns the metadata of a .cv file without extracting payloads.
func Inspect(data []byte) (*Metadata, error) {
	ctx, err := loadContext(data)
	if err != nil {
		return nil, err
	}
	xml, err := readMetadataXML(ctx)
	if err != nil {
		return nil, err
	}
	if xml == "" {
		return nil, fmt.Errorf("not a .cv file: no /Metadata stream")
	}
	meta, ok := parseXMP(xml)
	if !ok {
		return nil, fmt.Errorf("not a .cv file: XMP missing required cv: properties")
	}
	return meta, nil
}
