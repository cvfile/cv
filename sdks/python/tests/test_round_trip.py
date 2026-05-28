"""End-to-end round-trip tests for the cvfile Python SDK."""

from __future__ import annotations

import hashlib
import io

import pypdf
import pytest

from cvfile import (
    extract,
    extract_html,
    extract_markdown,
    inspect,
    is_cv_file,
    pack,
    validate,
)

SAMPLE_MD = """# Jane Doe

Senior software engineer.

## Experience

- ACME Corp 2022 to 2026
- Initech 2018 to 2022
"""

SAMPLE_HTML = """<!doctype html>
<html lang="en"><body><h1>Jane Doe</h1></body></html>"""


def make_blank_pdf() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=300, height=400)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_round_trip_markdown_byte_identical() -> None:
    cv = pack(pdf=make_blank_pdf(), markdown=SAMPLE_MD, metadata={"primary_language": "en"})
    assert isinstance(cv, bytes)
    assert cv[:4] == b"%PDF"
    md = extract_markdown(cv)
    assert md == SAMPLE_MD


def test_round_trip_html_byte_identical() -> None:
    cv = pack(pdf=make_blank_pdf(), html=SAMPLE_HTML, metadata={"primary_language": "en"})
    html = extract_html(cv)
    assert html == SAMPLE_HTML


def test_three_payloads_metadata() -> None:
    cv = pack(
        pdf=make_blank_pdf(),
        markdown=SAMPLE_MD,
        html=SAMPLE_HTML,
        json_resume={"basics": {"name": "Jane Doe"}},
        metadata={"primary_language": "en"},
    )
    file = extract(cv)
    names = sorted(p.name for p in file.payloads)
    assert names == ["resume.html", "resume.json", "resume.md"]
    assert file.metadata.primary_payload == "resume.md"
    assert file.metadata.primary_language == "en"


def test_inspect_returns_metadata_with_integrity() -> None:
    cv = pack(
        pdf=make_blank_pdf(),
        markdown=SAMPLE_MD,
        metadata={"primary_language": "fr", "generator": "test/1.0"},
    )
    meta = inspect(cv)
    assert meta.version == "0.1"
    assert meta.primary_language == "fr"
    assert meta.generator == "test/1.0"
    assert len(meta.integrity) == 1
    assert meta.integrity[0].algorithm == "sha-256"
    assert meta.integrity[0].payload == "resume.md"
    expected = hashlib.sha256(SAMPLE_MD.encode()).hexdigest()
    assert meta.integrity[0].digest == expected


def test_is_cv_file_distinguishes_pdf_and_cv() -> None:
    plain = make_blank_pdf()
    assert is_cv_file(plain) is False
    cv = pack(pdf=plain, markdown=SAMPLE_MD, metadata={"primary_language": "en"})
    assert is_cv_file(cv) is True


def test_validate_passes_freshly_packed_file() -> None:
    cv = pack(pdf=make_blank_pdf(), markdown=SAMPLE_MD, metadata={"primary_language": "en"})
    report = validate(cv)
    assert report.ok is True
    assert report.level == "cv-lenient"


def test_validate_rejects_plain_pdf() -> None:
    report = validate(make_blank_pdf())
    assert report.ok is False
    assert any(i.code == "no-xmp" for i in report.issues)


def test_extract_raises_valueerror_on_garbage() -> None:
    with pytest.raises(ValueError):
        extract(b"definitely not a pdf")


def test_inspect_raises_valueerror_on_garbage() -> None:
    with pytest.raises(ValueError):
        inspect(b"%PDF-1.7 truncated and broken")
