"""inspect(): return only the metadata, without extracting payloads."""

from __future__ import annotations

import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from cvfile._pdf import read_metadata_xml
from cvfile._types import CvMetadata
from cvfile._xmp import parse_xmp


def inspect(data: bytes) -> CvMetadata:
    try:
        reader = PdfReader(io.BytesIO(data))
    except (PdfReadError, KeyError, ValueError) as err:
        raise ValueError(f"Not a .cv file: failed to parse PDF ({err})") from err
    xml = read_metadata_xml(reader)
    if not xml:
        raise ValueError("Not a .cv file: no /Metadata XMP stream")
    meta = parse_xmp(xml)
    if not meta:
        raise ValueError("Not a .cv file: XMP missing required cv: properties")
    return meta


__all__ = ["inspect"]
