"""Smoke tests for cvfile-cv-detector against the canonical .cv fixture."""

from __future__ import annotations

from pathlib import Path

import pytest

from cvfile_cv_detector import detect, unwrap

FIXTURE = Path(__file__).parents[3].parent / "packages" / "sdk-js" / "tests" / "fixtures" / "python-produced.cv"


@pytest.fixture(scope="module")
def cv_bytes() -> bytes:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    return FIXTURE.read_bytes()


def test_detect_recognises_cv_file(cv_bytes: bytes) -> None:
    det = detect(cv_bytes)
    assert det.is_cv_file is True
    assert det.version
    assert det.primary_payload == "resume.md"
    assert det.primary_language


def test_detect_rejects_plain_pdf() -> None:
    plain = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<<>>\n%%EOF"
    det = detect(plain)
    assert det.is_cv_file is False


def test_detect_rejects_garbage() -> None:
    det = detect(b"hello world")
    assert det.is_cv_file is False


def test_unwrap_returns_primary_markdown(cv_bytes: bytes) -> None:
    payload = unwrap(cv_bytes)
    assert payload is not None
    assert payload.name == "resume.md"
    assert payload.mime_type == "text/markdown"
    assert payload.bytes_.decode("utf-8").strip()


def test_unwrap_specific_payload(cv_bytes: bytes) -> None:
    payload = unwrap(cv_bytes, payload_name="resume.html")
    assert payload is not None
    assert payload.name == "resume.html"
    assert payload.mime_type == "text/html"


def test_unwrap_missing_payload_returns_none(cv_bytes: bytes) -> None:
    payload = unwrap(cv_bytes, payload_name="does-not-exist.txt")
    assert payload is None


def test_unwrap_non_cv_returns_none() -> None:
    assert unwrap(b"%PDF-1.7\n%%EOF") is None
