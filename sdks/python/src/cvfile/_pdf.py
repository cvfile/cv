"""Thin pypdf wrapper for /AF Associated Files and /Metadata streams.

This module isolates pypdf so we can swap to pikepdf later without changing the
public API. PDF/A-3 conformance work that requires deeper PDF rewriting (font
embedding, ICC profile injection on arbitrary input PDFs) will land here.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    ByteStringObject,
    DecodedStreamObject,
    DictionaryObject,
    IndirectObject,
    NameObject,
    NumberObject,
    StreamObject,
    TextStringObject,
)

AFRelationshipKind = Literal["Alternative", "Data", "Supplement"]


@dataclass(frozen=True, slots=True)
class RawPayload:
    name: str
    mime_type: str
    relationship: AFRelationshipKind
    bytes_: bytes
    description: str | None = None


def load_writer(pdf_bytes: bytes) -> PdfWriter:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter(clone_from=reader)
    return writer


def add_associated_file(
    writer: PdfWriter,
    *,
    name: str,
    data: bytes,
    mime_type: str,
    description: str,
    relationship: AFRelationshipKind,
    creation_date: datetime,
    modification_date: datetime,
) -> None:
    """Attach `data` as an Associated File on the document catalog (/AF)."""

    embedded_stream = DecodedStreamObject()
    embedded_stream.set_data(data)
    embedded_stream.update(
        {
            NameObject("/Type"): NameObject("/EmbeddedFile"),
            NameObject("/Subtype"): NameObject(_mime_to_name(mime_type)),
            NameObject("/Length"): NumberObject(len(data)),
            NameObject("/Params"): DictionaryObject(
                {
                    NameObject("/CreationDate"): TextStringObject(_pdf_date(creation_date)),
                    NameObject("/ModDate"): TextStringObject(_pdf_date(modification_date)),
                    NameObject("/Size"): NumberObject(len(data)),
                    NameObject("/CheckSum"): ByteStringObject(hashlib.md5(data).digest()),
                }
            ),
        }
    )
    embedded_ref = writer._add_object(embedded_stream)

    filespec = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Filespec"),
            NameObject("/F"): TextStringObject(name),
            NameObject("/UF"): TextStringObject(name),
            NameObject("/Desc"): TextStringObject(description),
            NameObject("/AFRelationship"): NameObject(f"/{relationship}"),
            NameObject("/EF"): DictionaryObject(
                {NameObject("/F"): embedded_ref, NameObject("/UF"): embedded_ref}
            ),
        }
    )
    filespec_ref = writer._add_object(filespec)

    catalog = writer._root_object
    af_array = catalog.get(NameObject("/AF"))
    if isinstance(af_array, IndirectObject):
        af_array = af_array.get_object()
    if not isinstance(af_array, ArrayObject):
        af_array = ArrayObject()
        catalog[NameObject("/AF")] = af_array
    af_array.append(filespec_ref)


def set_metadata_xml(writer: PdfWriter, xml: str) -> None:
    data = xml.encode("utf-8")
    stream = DecodedStreamObject()
    stream.set_data(data)
    stream.update(
        {
            NameObject("/Type"): NameObject("/Metadata"),
            NameObject("/Subtype"): NameObject("/XML"),
            NameObject("/Length"): NumberObject(len(data)),
        }
    )
    ref = writer._add_object(stream)
    writer._root_object[NameObject("/Metadata")] = ref


def write_to_bytes(writer: PdfWriter) -> bytes:
    _ensure_trailer_id(writer)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _ensure_trailer_id(writer: PdfWriter) -> None:
    """Set the trailer /ID array (PDF/A-3u rule 6.1.3)."""
    import secrets

    if getattr(writer, "_ID", None):
        return
    id_hex = secrets.token_hex(16).upper().encode("ascii")
    writer._ID = ArrayObject([ByteStringObject(id_hex), ByteStringObject(id_hex)])


def read_associated_files(reader: PdfReader) -> list[RawPayload]:
    catalog = reader.trailer.get("/Root")
    if catalog is None:
        return []
    catalog = catalog.get_object() if isinstance(catalog, IndirectObject) else catalog
    af = catalog.get("/AF") if isinstance(catalog, DictionaryObject) else None
    if af is None:
        return []
    if isinstance(af, IndirectObject):
        af = af.get_object()
    if not isinstance(af, ArrayObject):
        return []

    out: list[RawPayload] = []
    for entry in af:
        filespec = entry.get_object() if isinstance(entry, IndirectObject) else entry
        payload = _parse_filespec(filespec)
        if payload:
            out.append(payload)
    return out


def read_metadata_xml(reader: PdfReader) -> str | None:
    root = reader.trailer.get("/Root")
    if root is None:
        return None
    root = root.get_object() if isinstance(root, IndirectObject) else root
    meta = root.get("/Metadata") if isinstance(root, DictionaryObject) else None
    if meta is None:
        return None
    meta = meta.get_object() if isinstance(meta, IndirectObject) else meta
    if not isinstance(meta, StreamObject):
        return None
    data: object = meta.get_data()
    if isinstance(data, str):
        return data
    if isinstance(data, bytes):
        return data.decode("utf-8", errors="replace")
    return None


def _parse_filespec(filespec: object) -> RawPayload | None:
    if not isinstance(filespec, DictionaryObject):
        return None
    ef = filespec.get("/EF")
    if ef is None:
        return None
    ef = ef.get_object() if isinstance(ef, IndirectObject) else ef
    if not isinstance(ef, DictionaryObject):
        return None
    stream_ref = ef.get("/UF") or ef.get("/F")
    if stream_ref is None:
        return None
    stream = stream_ref.get_object() if isinstance(stream_ref, IndirectObject) else stream_ref
    if not isinstance(stream, StreamObject):
        return None

    raw_data: object = stream.get_data()
    if isinstance(raw_data, str):
        data = raw_data.encode("latin-1", errors="replace")
    elif isinstance(raw_data, bytes):
        data = raw_data
    else:
        return None

    name_obj = filespec.get("/UF") or filespec.get("/F")
    if name_obj is None:
        return None
    name = str(name_obj)

    subtype = stream.get("/Subtype") or filespec.get("/Subtype")
    mime_type = _name_to_mime(str(subtype)) if subtype else "application/octet-stream"

    desc_obj = filespec.get("/Desc")
    description = str(desc_obj) if desc_obj else None

    rel_obj = filespec.get("/AFRelationship")
    rel_str = str(rel_obj).lstrip("/") if rel_obj else "Supplement"
    if rel_str not in {"Alternative", "Data", "Supplement"}:
        rel_str = "Supplement"
    rel: AFRelationshipKind = rel_str  # type: ignore[assignment]

    return RawPayload(name=name, mime_type=mime_type, relationship=rel, bytes_=bytes(data), description=description)


def _mime_to_name(mime: str) -> str:
    """Wrap a MIME type for use as a PDF Name. pypdf's NameObject handles
    the per-character #XX escaping itself when serializing; we MUST NOT
    pre-escape, otherwise the '#' of our own escape gets re-escaped to '#23'.
    """
    return "/" + mime


def _name_to_mime(name: str) -> str:
    s = name.lstrip("/")
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "#" and i + 2 < len(s):
            try:
                out.append(chr(int(s[i + 1 : i + 3], 16)))
                i += 3
                continue
            except ValueError:
                pass
        out.append(c)
        i += 1
    return "".join(out)


def _pdf_date(dt: datetime) -> str:
    """Format a datetime as a PDF date string (D:YYYYMMDDHHmmSS+HH'mm')."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("D:%Y%m%d%H%M%S+00'00'")


__all__ = [
    "AFRelationshipKind",
    "ByteStringObject",
    "RawPayload",
    "add_associated_file",
    "load_writer",
    "read_associated_files",
    "read_metadata_xml",
    "set_metadata_xml",
    "write_to_bytes",
]
