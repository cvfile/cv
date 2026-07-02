"""Security validator tests against the shared malicious-corpus fixtures."""

from __future__ import annotations

import io
import json
from pathlib import Path

import pypdf
import pytest

from cvfile import PayloadTooLargeError, extract, pack, validate
from cvfile.validate import DEFAULT_MAX_PAYLOAD_BYTES, _check_version

REPO_ROOT = Path(__file__).resolve().parents[3]
MAL_DIR = REPO_ROOT / "spec" / "test-vectors" / "malicious"
JS_PDF = REPO_ROOT / "packages" / "sdk-js" / "examples" / "out" / "jane-doe.pdf"


def _manifest() -> list[dict]:
    return json.loads((MAL_DIR / "manifest.json").read_text())["fixtures"]


@pytest.mark.parametrize("entry", _manifest(), ids=lambda e: e["filename"])
def test_rejects_malicious_fixture(entry: dict) -> None:
    path = MAL_DIR / entry["filename"]
    if not path.exists():
        pytest.skip("fixture missing: rebuild via tools/build-malicious.ts")

    report = validate(path.read_bytes())
    codes = [i.code for i in report.issues]

    assert not report.ok, f"{entry['filename']} should fail: {entry['description']}\nissues={codes}"
    assert entry["expectedCode"] in codes, (
        f"{entry['filename']} expected code {entry['expectedCode']!r}, got {codes}"
    )


def test_encrypted_fixture_flagged_without_crashing() -> None:
    """The encrypted vector must be rejected with encrypted-document and never
    raise (pypdf's KeyError('/P') used to escape validate())."""
    path = MAL_DIR / "encrypted.cv"
    if not path.exists():
        pytest.skip("encrypted fixture missing")
    report = validate(path.read_bytes())  # must not raise
    assert not report.ok
    assert [i.code for i in report.issues] == ["encrypted-document"]


def test_garbage_input_yields_parse_failed_not_raise() -> None:
    report = validate(b"not a pdf at all")
    assert not report.ok
    assert any(i.code == "pdf-parse-failed" for i in report.issues)


@pytest.mark.parametrize(
    ("version", "warns"),
    [("0.1", False), ("1.0", False), ("1.4", False), ("2.0", True), ("3.2", True)],
)
def test_newer_format_version_warning(version: str, warns: bool) -> None:
    issue = _check_version(version)
    if warns:
        assert issue is not None
        assert issue.code == "newer-format-version"
        assert issue.level == "warning"
    else:
        assert issue is None


def test_payload_size_cap() -> None:
    if not JS_PDF.exists():
        pytest.skip("base PDF fixture missing")

    big_md = "# Big\n\n" + ("x" * (5 * 1024 * 1024))
    cv_bytes = pack(
        pdf=JS_PDF.read_bytes(),
        markdown=big_md,
        metadata={
            "primary_language": "en",
            "primary_payload": "resume.md",
            "generator": "cv-security-test",
        },
    )

    pass_report = validate(cv_bytes)
    assert pass_report.ok
    assert DEFAULT_MAX_PAYLOAD_BYTES >= 16 * 1024 * 1024

    fail_report = validate(cv_bytes, max_payload_bytes=1024 * 1024)
    assert not fail_report.ok
    too_large = next((i for i in fail_report.issues if i.code == "payload-too-large"), None)
    assert too_large is not None
    assert too_large.payload == "resume.md"


def _blank_pdf() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=300, height=400)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture(scope="module")
def oversized_cv() -> bytes:
    """A .cv whose markdown payload exceeds the default 16 MiB cap once decoded."""
    big_md = "# Big\n\n" + "x" * (DEFAULT_MAX_PAYLOAD_BYTES + 1)
    return pack(pdf=_blank_pdf(), markdown=big_md, metadata={"primary_language": "en"})


def test_extract_rejects_oversized_payload_by_default(oversized_cv: bytes) -> None:
    with pytest.raises(PayloadTooLargeError) as excinfo:
        extract(oversized_cv)
    assert isinstance(excinfo.value, ValueError)
    assert excinfo.value.payload == "resume.md"
    assert excinfo.value.max_payload_bytes == DEFAULT_MAX_PAYLOAD_BYTES
    assert excinfo.value.size > DEFAULT_MAX_PAYLOAD_BYTES


def test_extract_accepts_oversized_payload_with_explicit_higher_cap(oversized_cv: bytes) -> None:
    file = extract(oversized_cv, max_payload_bytes=32 * 1024 * 1024)
    assert any(p.name == "resume.md" for p in file.payloads)


def test_extract_accepts_oversized_payload_with_cap_disabled(oversized_cv: bytes) -> None:
    file = extract(oversized_cv, max_payload_bytes=None)
    md = next(p for p in file.payloads if p.name == "resume.md")
    assert len(md.bytes_) > DEFAULT_MAX_PAYLOAD_BYTES


def test_extract_default_cap_leaves_normal_files_alone() -> None:
    cv_bytes = pack(pdf=_blank_pdf(), markdown="# Small\n", metadata={"primary_language": "en"})
    file = extract(cv_bytes)
    assert [p.name for p in file.payloads] == ["resume.md"]
    # A deliberately tiny cap trips the pre-decode (encoded stream) heuristic.
    with pytest.raises(PayloadTooLargeError):
        extract(cv_bytes, max_payload_bytes=4)
