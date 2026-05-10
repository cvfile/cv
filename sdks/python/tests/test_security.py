"""Security validator tests against the shared malicious-corpus fixtures."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cvfile import pack, validate
from cvfile.validate import DEFAULT_MAX_PAYLOAD_BYTES

REPO_ROOT = Path(__file__).resolve().parents[3]
MAL_DIR = REPO_ROOT / "spec" / "test-vectors" / "malicious"
JS_PDF = REPO_ROOT / "packages" / "sdk-js" / "examples" / "out" / "jane-doe.pdf"


def _manifest() -> list[dict]:
    return json.loads((MAL_DIR / "manifest.json").read_text())["fixtures"]


@pytest.mark.parametrize("entry", _manifest(), ids=lambda e: e["filename"])
def test_rejects_malicious_fixture(entry: dict) -> None:
    path = MAL_DIR / entry["filename"]
    if not path.exists():
        pytest.skip(f"fixture missing: rebuild via tools/build-malicious.ts")

    report = validate(path.read_bytes())
    codes = [i.code for i in report.issues]

    assert not report.ok, f"{entry['filename']} should fail: {entry['description']}\nissues={codes}"
    assert entry["expectedCode"] in codes, (
        f"{entry['filename']} expected code {entry['expectedCode']!r}, got {codes}"
    )


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
