"""extract(): read a .cv file and return the parsed metadata + payloads."""

from __future__ import annotations

import io

from pypdf import PdfReader

from cvfile._constants import PAYLOAD_MIME_TYPES
from cvfile._pdf import read_associated_files, read_metadata_xml
from cvfile._types import CvFile, ExtractedPayload
from cvfile._xmp import parse_xmp


def extract(data: bytes) -> CvFile:
    """Parse a .cv file's metadata and embedded payloads."""
    reader = PdfReader(io.BytesIO(data))

    xml = read_metadata_xml(reader)
    if not xml:
        raise ValueError("Not a .cv file: no /Metadata XMP stream in catalog")

    metadata = parse_xmp(xml)
    if not metadata:
        raise ValueError("Not a .cv file: XMP missing required cv: properties")

    raws = read_associated_files(reader)
    alt_lang = {a.payload: a.language for a in metadata.alternates}

    payloads = tuple(
        ExtractedPayload(
            name=raw.name,
            mime_type=raw.mime_type,
            relationship=raw.relationship,
            bytes_=raw.bytes_,
            language=alt_lang.get(raw.name) or metadata.primary_language,
            description=raw.description,
        )
        for raw in raws
    )

    return CvFile(bytes_=data, metadata=metadata, payloads=payloads)


def extract_markdown(data: bytes, *, language: str | None = None) -> str | None:
    """Return the markdown payload as text, preferring the requested language."""
    file = extract(data)
    return _pick_text(file, PAYLOAD_MIME_TYPES["markdown"], language or file.metadata.primary_language)


def extract_html(data: bytes, *, language: str | None = None) -> str | None:
    """Return the HTML payload as text, preferring the requested language."""
    file = extract(data)
    return _pick_text(file, PAYLOAD_MIME_TYPES["html"], language or file.metadata.primary_language)


def _pick_text(file: CvFile, mime_type: str, prefer_lang: str) -> str | None:
    matches = [p for p in file.payloads if p.mime_type == mime_type]
    if not matches:
        return None
    chosen = next((p for p in matches if p.language == prefer_lang), matches[0])
    return chosen.text()


__all__ = ["extract", "extract_html", "extract_markdown"]
