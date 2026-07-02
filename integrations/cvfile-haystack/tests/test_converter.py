"""Smoke tests for the Haystack CVFileToDocument converter."""

from __future__ import annotations

from pathlib import Path

import pytest
from haystack import Document
from haystack.dataclasses import ByteStream

from haystack_integrations.components.converters.cvfile import CVFileToDocument

FIXTURE = Path(__file__).parents[3] / "packages" / "sdk-js" / "tests" / "fixtures" / "python-produced.cv"
UNICODE_FIXTURE = Path(__file__).parents[2] / "tests" / "fixtures" / "unicode.cv"
MALICIOUS_FIXTURE = Path(__file__).parents[3] / "spec" / "test-vectors" / "malicious" / "js-action.cv"


@pytest.fixture(scope="module")
def converter() -> CVFileToDocument:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    return CVFileToDocument()


def test_run_returns_documents(converter: CVFileToDocument) -> None:
    result = converter.run(sources=[FIXTURE])
    docs = result["documents"]
    assert len(docs) >= 1
    assert all(isinstance(d, Document) for d in docs)


def test_each_document_has_required_meta(converter: CVFileToDocument) -> None:
    docs = converter.run(sources=[FIXTURE])["documents"]
    for doc in docs:
        for key in ("source", "payload", "mime_type", "relationship", "language", "primary", "cv_version"):
            assert key in doc.meta, f"missing meta key {key} on {doc.meta.get('payload')}"


def test_exactly_one_primary_document(converter: CVFileToDocument) -> None:
    docs = converter.run(sources=[FIXTURE])["documents"]
    primaries = [d for d in docs if d.meta["primary"]]
    assert len(primaries) == 1


def test_primary_only_emits_just_the_primary() -> None:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    primary_only = CVFileToDocument(primary_only=True)
    docs = primary_only.run(sources=[FIXTURE])["documents"]
    assert len(docs) == 1
    assert docs[0].meta["primary"] is True
    assert docs[0].content.strip()


def test_extra_meta_is_merged() -> None:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    converter = CVFileToDocument()
    docs = converter.run(sources=[FIXTURE], meta={"candidate_id": "abc123"})["documents"]
    assert docs, "expected at least one document"
    assert all(d.meta.get("candidate_id") == "abc123" for d in docs)


def test_accepts_bytestream() -> None:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    stream = ByteStream(data=FIXTURE.read_bytes(), meta={"file_name": "jane.cv"})
    converter = CVFileToDocument()
    docs = converter.run(sources=[stream])["documents"]
    assert docs
    assert docs[0].meta["source"] == "jane.cv"


def test_unreadable_source_is_skipped(tmp_path: Path) -> None:
    """Parse failures are logged and skipped when verification is off; with
    verify=True (default) the same garbage fails validation and raises."""
    not_a_cv = tmp_path / "garbage.cv"
    not_a_cv.write_bytes(b"not a real cv file")
    result = CVFileToDocument(verify=False).run(sources=[not_a_cv])
    assert result["documents"] == []
    with pytest.raises(ValueError, match="pdf-parse-failed"):
        CVFileToDocument().run(sources=[not_a_cv])


def test_chunks_mode_attaches_a_vector_per_chunk() -> None:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    docs = CVFileToDocument(mode="chunks").run(sources=[FIXTURE])["documents"]
    assert len(docs) >= 1
    for doc in docs:
        assert doc.embedding is not None
        assert len(doc.embedding) == doc.meta["embedding_dimension"]
        assert all(isinstance(v, float) for v in doc.embedding)
        assert doc.content.strip(), "chunk text should not be empty"


def test_invalid_mode_rejected() -> None:
    with pytest.raises(ValueError):
        CVFileToDocument(mode="bogus")


def test_verify_rejects_malicious_file() -> None:
    if not MALICIOUS_FIXTURE.exists():
        pytest.skip(f"fixture not found: {MALICIOUS_FIXTURE}")
    with pytest.raises(ValueError, match="javascript-action"):
        CVFileToDocument().run(sources=[MALICIOUS_FIXTURE])


def test_verify_false_converts_malicious_file() -> None:
    if not MALICIOUS_FIXTURE.exists():
        pytest.skip(f"fixture not found: {MALICIOUS_FIXTURE}")
    docs = CVFileToDocument(verify=False).run(sources=[MALICIOUS_FIXTURE])["documents"]
    assert len(docs) >= 1


def test_verify_default_passes_on_valid_file() -> None:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    converter = CVFileToDocument()
    assert converter.verify is True
    assert len(converter.run(sources=[FIXTURE])["documents"]) >= 1


def test_non_ascii_chunk_text_slices_on_byte_offsets() -> None:
    if not UNICODE_FIXTURE.exists():
        pytest.skip(f"fixture not found: {UNICODE_FIXTURE}")
    docs = CVFileToDocument(mode="chunks").run(sources=[UNICODE_FIXTURE])["documents"]
    joined = "".join(d.content for d in docs)
    assert "Élodie" in joined
    assert "工程師" in joined
    assert "🚀" in joined
    assert "经验" in joined
    for doc in docs:
        assert doc.content == doc.content.encode("utf-8").decode("utf-8")
