"""In-process PDF/A-3u conformance tests.

Mirrors ``packages/sdk-js/tests/pdfa.test.ts`` so both SDKs agree on verdicts and
issue codes. cv-strict is defined by PDF/A-3u conformance, so the SDK must run a
real structural check rather than asserting a clean pass: the cardinal rule is to
never report a clean strict pass for a file we can prove is non-conformant.
"""

from __future__ import annotations

import io
from pathlib import Path

from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject

from cvfile import pack, validate

CONFORMANT_FIXTURE = Path(__file__).parent / "fixtures" / "python-produced.cv"


def _make_non_embedded_font_pdf() -> bytes:
    """A PDF whose page references the standard-14 Helvetica by name, with no
    embedded font program: the exact case a minimal exporter produces and that
    PDF/A-3u §6.2.11.4.1 forbids. Mirrors the JS test's pdf-lib StandardFonts.Helvetica.
    """
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=400)

    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    font_ref = writer._add_object(font)
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref})}
    )

    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _pack_with_non_embedded_font() -> bytes:
    return pack(
        pdf=_make_non_embedded_font_pdf(),
        markdown="# Jane Doe\n",
        metadata={"primary_language": "en"},
    )


def test_strict_fails_on_non_embedded_font_instead_of_false_pass() -> None:
    cv = _pack_with_non_embedded_font()
    report = validate(cv, strict=True)

    assert report.ok is False
    assert report.conformance == "failed"
    assert any(i.code == "pdfa3-font-not-embedded" and i.level == "error" for i in report.issues)


def test_lenient_does_not_run_pdfa_check_nor_falsely_fail() -> None:
    cv = _pack_with_non_embedded_font()
    report = validate(cv, strict=False)

    assert report.ok is True
    assert report.conformance == "not-checked"
    assert not any(i.code.startswith("pdfa3-") for i in report.issues)


def test_strict_reports_structural_pass_on_conformant_file() -> None:
    data = CONFORMANT_FIXTURE.read_bytes()
    report = validate(data, strict=True)

    assert report.ok is True
    assert report.conformance == "structural-pass"
    # The honest caveat (full conformance still needs veraPDF) is a surfaced
    # warning, never swallowed.
    assert any(i.code == "pdfa3-structural-pass" and i.level == "warning" for i in report.issues)
