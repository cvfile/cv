"""Tiny standalone detector for the .cv open file format.

A .cv file is a valid PDF that carries Markdown and HTML payloads via PDF
Associated Files (/AF). Crawlers that already read application/pdf can use
this module to (a) detect a .cv wrapper inside an arbitrary PDF and (b)
unwrap the canonical Markdown payload directly, skipping OCR over the
visual layer entirely.

Detection is dependency free regex over the PDF bytes (the XMP packet is
plain XML embedded in the PDF). Unwrap depends on pypdf only because PDF
stream parsing without a library is genuinely error prone.

Spec: https://cvfile.org/spec/
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass

CV_NAMESPACE_URI = "http://ns.cvfile.org/cv/1.0/"

__all__ = ["CV_NAMESPACE_URI", "CvDetection", "UnwrappedPayload", "detect", "unwrap"]


@dataclass(frozen=True)
class CvDetection:
    is_cv_file: bool
    version: str | None = None
    primary_payload: str | None = None
    primary_language: str | None = None
    generator: str | None = None


@dataclass(frozen=True)
class UnwrappedPayload:
    name: str
    mime_type: str
    bytes_: bytes


def detect(pdf_bytes: bytes) -> CvDetection:
    """Return a CvDetection describing whether `pdf_bytes` is a .cv file.

    Zero dependencies. The cv XMP packet is plain XML embedded in the PDF,
    so we scan the bytes directly: any false positive would still fail the
    follow up cv:version regex.
    """
    if len(pdf_bytes) < 4 or pdf_bytes[:4] != b"%PDF":
        return CvDetection(is_cv_file=False)
    if CV_NAMESPACE_URI.encode("ascii") not in pdf_bytes:
        return CvDetection(is_cv_file=False)

    text = pdf_bytes.decode("latin-1", errors="replace")
    version = _inner(text, "cv:version")
    if not version:
        return CvDetection(is_cv_file=False)

    return CvDetection(
        is_cv_file=True,
        version=version,
        primary_payload=_inner(text, "cv:primaryPayload"),
        primary_language=_inner(text, "cv:primaryLanguage"),
        generator=_inner(text, "cv:generator"),
    )


def unwrap(pdf_bytes: bytes, payload_name: str | None = None) -> UnwrappedPayload | None:
    """Extract one /AF Associated File from a .cv file by name.

    If `payload_name` is None, returns the payload declared by
    cv:primaryPayload (typically `resume.md`). Returns None if the input
    is not a .cv, the named payload is absent, or the PDF is malformed.
    """
    det = detect(pdf_bytes)
    if not det.is_cv_file:
        return None
    target = payload_name or det.primary_payload
    if not target:
        return None

    try:
        from pypdf import PdfReader
        from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject, StreamObject
    except ImportError as e:
        raise RuntimeError("cvfile-cv-detector.unwrap() requires pypdf>=4") from e

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception:
        return None

    root = reader.trailer.get("/Root")
    if root is None:
        return None
    root = root.get_object() if isinstance(root, IndirectObject) else root
    if not isinstance(root, DictionaryObject):
        return None
    af = root.get("/AF")
    if isinstance(af, IndirectObject):
        af = af.get_object()
    if not isinstance(af, ArrayObject):
        return None

    for entry in af:
        filespec = entry.get_object() if isinstance(entry, IndirectObject) else entry
        if not isinstance(filespec, DictionaryObject):
            continue
        name = str(filespec.get("/UF") or filespec.get("/F") or "")
        if name != target:
            continue
        ef = filespec.get("/EF")
        if isinstance(ef, IndirectObject):
            ef = ef.get_object()
        if not isinstance(ef, DictionaryObject):
            continue
        stream_ref = ef.get("/UF") or ef.get("/F")
        if stream_ref is None:
            continue
        stream = stream_ref.get_object() if isinstance(stream_ref, IndirectObject) else stream_ref
        if not isinstance(stream, StreamObject):
            continue
        data = stream.get_data()
        if isinstance(data, str):
            data = data.encode("utf-8")
        subtype = stream.get("/Subtype") or filespec.get("/Subtype")
        mime = _name_to_mime(str(subtype)) if subtype else "application/octet-stream"
        return UnwrappedPayload(name=name, mime_type=mime, bytes_=bytes(data))

    return None


_TAG_RE: dict[str, tuple[re.Pattern[str], re.Pattern[str]]] = {}


def _inner(text: str, tag: str) -> str | None:
    """Read a cv XMP field.

    RDF allows two equivalent serialisations: the element form
    ``<cv:version>1.0</cv:version>`` and the attribute form
    ``cv:version="1.0"``. Try the element form first, then fall back to the
    attribute form so both shapes are detected identically.
    """
    pats = _TAG_RE.get(tag)
    if pats is None:
        q = re.escape(tag)
        elem = re.compile(rf"<{q}>([^<]*)</{q}>")
        attr = re.compile(rf"""{q}\s*=\s*"([^"]*)"|{q}\s*=\s*'([^']*)'""")
        pats = (elem, attr)
        _TAG_RE[tag] = pats
    elem, attr = pats
    m = elem.search(text)
    if m:
        return m.group(1).strip()
    m = attr.search(text)
    if m:
        return (m.group(1) or m.group(2) or "").strip()
    return None


def _name_to_mime(name: str) -> str:
    """Reverse pypdf's #XX escape in PDF Name objects representing MIME types."""
    s = name.lstrip("/")
    out: list[str] = []
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
