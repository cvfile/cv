"""In-process PDF/A-3u structural conformance check.

This is NOT a full ISO 19005-3 validator: that is what veraPDF is for, and the
CLI / CI run it as the authoritative gate. What this DOES do is verify the
load-bearing requirements that actually fail in practice when a real-world PDF
(Word, Google Docs, Canva, "Print to PDF") is wrapped into a ``.cv``, so the SDK
can give an honest verdict in environments where veraPDF cannot run. The cardinal
rule: never report a clean strict pass for a file we can prove is non-conformant.

Verdicts:
  - ``"failed"``          a hard PDF/A-3u violation was found (errors emitted)
  - ``"structural-pass"`` every requirement we can check in-process holds; full
                          ISO 19005-3 conformance still needs veraPDF (one warning)

The object-graph walk mirrors ``_security.py`` (catalog reachability from the
trailer ``/Root``), and the XMP marker check mirrors ``packages/sdk-js/src/pdfa.ts``
so the two SDKs agree byte for byte on verdicts and issue codes.
"""

from __future__ import annotations

import re
from typing import Literal

from pypdf import PdfReader
from pypdf.generic import (
    ArrayObject,
    DictionaryObject,
    IndirectObject,
    NameObject,
    PdfObject,
)

from cvfile._types import ValidationIssue

PdfaConformance = Literal["failed", "structural-pass"]

_FONT_FILE_KEYS = ("/FontFile", "/FontFile2", "/FontFile3")


def check_pdfa_conformance(reader: PdfReader, xmp_xml: str | None) -> tuple[PdfaConformance, list[ValidationIssue]]:
    """Run the structural PDF/A-3u checks.

    ``xmp_xml`` is the document's XMP packet, needed for the PDF/A identification
    markers (pdfaid:part / pdfaid:conformance) which live only in metadata, not in
    the object graph. Returns the conformance verdict and the issues produced.
    """
    issues: list[ValidationIssue] = []

    _check_fonts_embedded(reader, issues)
    _check_output_intent(reader, issues)
    _check_pdfa_id_markers(xmp_xml, issues)
    _check_file_id(reader, issues)

    if any(i.level == "error" for i in issues):
        return "failed", issues

    issues.append(
        ValidationIssue(
            code="pdfa3-structural-pass",
            level="warning",
            message=(
                "Verified the load-bearing PDF/A-3u requirements in-process (embedded fonts, sRGB output "
                "intent, PDF/A identification, file ID). Full ISO 19005-3 conformance additionally requires "
                "the veraPDF gate (run `cv validate` in CI or the Docker runner in tools/verapdf-runner)."
            ),
        )
    )
    return "structural-pass", issues


def _check_fonts_embedded(reader: PdfReader, issues: list[ValidationIssue]) -> None:
    """PDF/A-3u §6.2.11.4.1: every font used in the file MUST be embedded.

    This is the single requirement a normal-looking input PDF most often violates:
    the standard-14 base fonts (Helvetica, Times, Courier) are referenced by name
    with no embedded program. We walk every Font dictionary, descend Type0 composite
    fonts into their CIDFont descendant, and require a FontFile/FontFile2/FontFile3
    in the descriptor. Type3 fonts carry their glyphs as content streams and need no
    FontFile, so they are treated as embedded. Non-embedded fonts are deduplicated
    by /BaseFont name so a font reused across pages reports once.
    """
    root = reader.trailer.get("/Root")
    if root is None:
        return

    seen: set[int] = set()
    reported: set[str] = set()

    def walk(obj: PdfObject | None) -> None:
        if obj is None:
            return
        obj_id = id(obj)
        if obj_id in seen:
            return
        seen.add(obj_id)

        if isinstance(obj, DictionaryObject):
            if _is_font_dict(obj):
                name = _font_name(obj)
                if not _is_font_embedded(obj) and name not in reported:
                    reported.add(name)
                    issues.append(
                        ValidationIssue(
                            code="pdfa3-font-not-embedded",
                            level="error",
                            message=(
                                f'Font "{name}" is not embedded; PDF/A-3u requires every font to be embedded '
                                "(ISO 19005-3 §6.2.11.4.1). The input PDF used a non-embedded font (often a "
                                "standard-14 base font from a minimal exporter). Re-export with fonts embedded, "
                                "or normalize the PDF first."
                            ),
                        )
                    )
            for value in obj.values():
                walk(_resolve(value))
        elif isinstance(obj, ArrayObject):
            for item in obj:
                walk(_resolve(item))

    walk(_resolve(root))


def _is_font_dict(d: DictionaryObject) -> bool:
    return _name_of(d.get("/Type")) == "Font"


def _font_subtype(d: DictionaryObject) -> str | None:
    return _name_of(d.get("/Subtype"))


def _font_name(d: DictionaryObject) -> str:
    base = _name_of(d.get("/BaseFont"))
    return base if base else "unknown"


def _is_font_embedded(font_dict: DictionaryObject) -> bool:
    subtype = _font_subtype(font_dict)

    # Type3 glyphs are inline content streams: embedded by construction.
    if subtype == "Type3":
        return True

    # Type0 is a composite font: the real program lives on the CIDFont descendant.
    if subtype == "Type0":
        descendants = _resolve(font_dict.get("/DescendantFonts"))
        if isinstance(descendants, ArrayObject) and len(descendants) > 0:
            cid_font = _resolve(descendants[0])
            if isinstance(cid_font, DictionaryObject):
                return _descriptor_has_font_file(cid_font)
        return False

    return _descriptor_has_font_file(font_dict)


def _descriptor_has_font_file(font_dict: DictionaryObject) -> bool:
    descriptor = _resolve(font_dict.get("/FontDescriptor"))
    if not isinstance(descriptor, DictionaryObject):
        return False
    return any(descriptor.get(key) is not None for key in _FONT_FILE_KEYS)


def _check_output_intent(reader: PdfReader, issues: list[ValidationIssue]) -> None:
    """PDF/A §6.2.2: an OutputIntent is only MANDATORY when the file uses
    device-dependent colour (DeviceRGB/Gray/CMYK) without a calibrated alternative.

    A text-only resume with no colour operators is conformant without one, so its
    absence is reported as a warning, not a hard failure: proving the colour
    condition in-process would require walking every content stream, and
    false-failing a conformant file is worse than deferring to veraPDF. ``pack`` adds
    an sRGB intent, so files this SDK produces always carry one; a malformed intent
    that IS present is still only flagged as suspicious.
    """
    root = _resolve(reader.trailer.get("/Root"))
    intents = _resolve(root.get("/OutputIntents")) if isinstance(root, DictionaryObject) else None
    if not isinstance(intents, ArrayObject) or len(intents) == 0:
        issues.append(
            ValidationIssue(
                code="pdfa3-no-output-intent",
                level="warning",
                message=(
                    "No /OutputIntents present. PDF/A-3u requires a GTS_PDFA1 output intent only when the file "
                    "uses device-dependent colour (ISO 19005-3 §6.2.2); veraPDF makes the final call. `pack` adds "
                    "an sRGB intent, so this is typically an externally produced file."
                ),
            )
        )
        return

    for entry in intents:
        intent = _resolve(entry)
        if not isinstance(intent, DictionaryObject):
            continue
        is_pdfa_intent = _name_of(intent.get("/S")) == "GTS_PDFA1"
        has_profile = _resolve(intent.get("/DestOutputProfile")) is not None
        if is_pdfa_intent and has_profile:
            return

    issues.append(
        ValidationIssue(
            code="pdfa3-output-intent-incomplete",
            level="warning",
            message=(
                "An /OutputIntents array is present but none is a GTS_PDFA1 intent carrying an embedded "
                "DestOutputProfile; veraPDF will confirm whether this is conformant (ISO 19005-3 §6.2.2)."
            ),
        )
    )


def _check_pdfa_id_markers(xmp_xml: str | None, issues: list[ValidationIssue]) -> None:
    """PDF/A §6.7.11: the file MUST be identified as PDF/A in XMP via the pdfaid
    namespace: pdfaid:part = 3 and pdfaid:conformance = A | U | B.

    These appear only in metadata, so we read the XMP packet directly. Both
    attribute form (``rdf:Description pdfaid:part="3"``) and element form
    (``<pdfaid:part>3</pdfaid:part>``) are accepted.
    """
    if not xmp_xml:
        issues.append(
            ValidationIssue(
                code="pdfa3-no-id-markers",
                level="error",
                message="XMP packet is absent; PDF/A-3u requires pdfaid:part and pdfaid:conformance markers.",
            )
        )
        return

    part = _read_xmp_value(xmp_xml, "pdfaid:part")
    conformance = _read_xmp_value(xmp_xml, "pdfaid:conformance")

    if part != "3":
        issues.append(
            ValidationIssue(
                code="pdfa3-id-part-mismatch",
                level="error",
                message=(
                    f'PDF/A identification pdfaid:part is "{part if part is not None else "absent"}"; '
                    "PDF/A-3u requires part 3 (ISO 19005-3 §6.7.11)."
                ),
            )
        )
    if not conformance or conformance not in ("A", "U", "B"):
        issues.append(
            ValidationIssue(
                code="pdfa3-id-conformance-missing",
                level="error",
                message=(
                    f'PDF/A identification pdfaid:conformance is "{conformance if conformance else "absent"}"; '
                    "PDF/A-3u requires A, U, or B (ISO 19005-3 §6.7.11)."
                ),
            )
        )


def _read_xmp_value(xml: str, key: str) -> str | None:
    """Read a pdfaid value in either attribute (``pdfaid:part="3"``) or element
    (``<pdfaid:part>3</pdfaid:part>``) form."""
    escaped = re.escape(key)
    attr = re.search(rf'{escaped}\s*=\s*["\']([^"\']*)["\']', xml)
    if attr:
        return attr.group(1).strip()
    elem = re.search(rf"<{escaped}[^>]*>([^<]*)</{escaped}>", xml)
    if elem:
        return elem.group(1).strip()
    return None


def _check_file_id(reader: PdfReader, issues: list[ValidationIssue]) -> None:
    """PDF/A §6.1.3: the trailer MUST contain a file identifier (/ID)."""
    file_id = _resolve(reader.trailer.get("/ID"))
    has_id = isinstance(file_id, ArrayObject) and len(file_id) >= 2
    if not has_id:
        issues.append(
            ValidationIssue(
                code="pdfa3-no-file-id",
                level="error",
                message="Trailer is missing a file identifier (/ID); PDF/A-3u requires one (ISO 19005-3 §6.1.3).",
            )
        )


def _name_of(value: object | None) -> str | None:
    """Normalize a PDF Name to its bare string (no leading slash), matching the
    helper in ``_security.py`` so both walks read names the same way."""
    if isinstance(value, NameObject):
        s = str(value)
        return s[1:] if s.startswith("/") else s
    if isinstance(value, str) and value.startswith("/"):
        return value[1:]
    return None


def _resolve(value: PdfObject | None) -> PdfObject | None:
    if value is None:
        return None
    if isinstance(value, IndirectObject):
        try:
            return value.get_object()
        except Exception:
            return None
    return value


__all__ = ["PdfaConformance", "check_pdfa_conformance"]
