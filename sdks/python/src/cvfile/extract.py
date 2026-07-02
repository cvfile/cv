"""extract(): read a .cv file and return the parsed metadata + payloads."""

from __future__ import annotations

import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from cvfile._constants import MAX_PAYLOAD_BYTES_DEFAULT, PAYLOAD_MIME_TYPES
from cvfile._pdf import read_associated_files, read_metadata_xml
from cvfile._types import CvFile, ExtractedPayload
from cvfile._xmp import parse_xmp


def extract(data: bytes, *, max_payload_bytes: int | None = MAX_PAYLOAD_BYTES_DEFAULT) -> CvFile:
    """Parse a .cv file's metadata and embedded payloads.

    ``max_payload_bytes`` caps each embedded payload (default 16 MiB, the
    spec §7.3 cap that ``validate()`` also enforces); an oversized payload
    raises :class:`cvfile.PayloadTooLargeError`. Pass ``None`` to disable the
    cap for trusted files.

    Limitation: pypdf decodes embedded file streams into a single buffer, so
    the cap is enforced on the still-encoded stream size before decoding
    (heuristic) and on the decoded size immediately after. A highly compressed
    payload is therefore decompressed into memory once before being rejected.
    """
    try:
        reader = PdfReader(io.BytesIO(data))
    except (PdfReadError, KeyError, ValueError) as err:
        raise ValueError(f"Not a .cv file: failed to parse PDF ({err})") from err

    xml = read_metadata_xml(reader)
    if not xml:
        raise ValueError("Not a .cv file: no /Metadata XMP stream in catalog")

    metadata = parse_xmp(xml)
    if not metadata:
        raise ValueError("Not a .cv file: XMP missing required cv: properties")

    raws = read_associated_files(reader, max_payload_bytes=max_payload_bytes)
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


def extract_markdown(
    data: bytes,
    *,
    language: str | None = None,
    max_payload_bytes: int | None = MAX_PAYLOAD_BYTES_DEFAULT,
) -> str | None:
    """Return the markdown payload as text, preferring the requested language."""
    file = extract(data, max_payload_bytes=max_payload_bytes)
    return _pick_text(file, PAYLOAD_MIME_TYPES["markdown"], language or file.metadata.primary_language)


def extract_html(
    data: bytes,
    *,
    language: str | None = None,
    max_payload_bytes: int | None = MAX_PAYLOAD_BYTES_DEFAULT,
) -> str | None:
    """Return the HTML payload as text, preferring the requested language."""
    file = extract(data, max_payload_bytes=max_payload_bytes)
    return _pick_text(file, PAYLOAD_MIME_TYPES["html"], language or file.metadata.primary_language)


def _pick_text(file: CvFile, mime_type: str, prefer_lang: str) -> str | None:
    matches = [p for p in file.payloads if p.mime_type == mime_type]
    if not matches:
        return None
    chosen = next((p for p in matches if p.language == prefer_lang), matches[0])
    return chosen.text()


__all__ = ["extract", "extract_html", "extract_markdown"]
