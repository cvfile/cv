"""Vector tests against the shared valid/boundary corpus (spec/test-vectors/valid)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from cvfile import PayloadTooLargeError, extract, validate

REPO_ROOT = Path(__file__).resolve().parents[3]
VALID_DIR = REPO_ROOT / "spec" / "test-vectors" / "valid"


def _manifest() -> list[dict]:
    path = VALID_DIR / "manifest.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())["fixtures"]


def _fixture_bytes(entry: dict) -> bytes:
    path = VALID_DIR / entry["filename"]
    if not path.exists():
        pytest.skip("fixture missing: rebuild via tools/build-valid.ts")
    return path.read_bytes()


@pytest.mark.parametrize("entry", _manifest(), ids=lambda e: e["filename"])
def test_valid_vector(entry: dict) -> None:
    data = _fixture_bytes(entry)
    report = validate(data)
    codes = [i.code for i in report.issues]

    if entry["expected"] == "error":
        assert not report.ok, f"{entry['filename']} should fail: {entry['description']}\nissues={codes}"
        assert entry["expectedCode"] in codes, (
            f"{entry['filename']} expected code {entry['expectedCode']!r}, got {codes}"
        )
        return

    assert report.ok, f"{entry['filename']} should pass: {entry['description']}\nissues={codes}"
    if entry["expected"] == "warning":
        warning = next((i for i in report.issues if i.code == entry["expectedCode"]), None)
        assert warning is not None, f"{entry['filename']} expected warning {entry['expectedCode']!r}, got {codes}"
        assert warning.level == "warning"

    # Both "valid" and "warning" fixtures must extract losslessly: spec §8.3
    # forbids dropping payloads even for a newer MAJOR version.
    file = extract(data)
    assert file.metadata.primary_payload == entry["primaryPayload"]
    assert file.metadata.primary_language == entry["primaryLanguage"]
    assert sorted(p.name for p in file.payloads) == sorted(entry["payloadNames"])
    primary = next(p for p in file.payloads if p.name == entry["primaryPayload"])
    assert len(primary.bytes_) > 0


def test_extract_rejects_oversized_vector_by_default() -> None:
    entry = next((e for e in _manifest() if e.get("expectedCode") == "payload-too-large"), None)
    assert entry is not None, "manifest lost its payload-too-large vector"
    data = _fixture_bytes(entry)
    with pytest.raises(PayloadTooLargeError):
        extract(data)
