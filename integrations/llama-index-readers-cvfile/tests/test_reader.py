"""Smoke tests for the LlamaIndex CV file reader against a real fixture."""

from __future__ import annotations

from pathlib import Path

import pytest
from llama_index.core.schema import Document

from llama_index.readers.cvfile import CVFileReader

FIXTURE = Path(__file__).parents[3] / "packages" / "sdk-js" / "tests" / "fixtures" / "python-produced.cv"
UNICODE_FIXTURE = Path(__file__).parents[2] / "tests" / "fixtures" / "unicode.cv"
MALICIOUS_FIXTURE = Path(__file__).parents[3] / "spec" / "test-vectors" / "malicious" / "js-action.cv"


@pytest.fixture(scope="module")
def reader() -> CVFileReader:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    return CVFileReader()


def test_reader_returns_documents(reader: CVFileReader) -> None:
    docs = reader.load_data(file=FIXTURE)
    assert len(docs) >= 1
    assert all(isinstance(d, Document) for d in docs)


def test_each_document_has_required_metadata(reader: CVFileReader) -> None:
    for doc in reader.load_data(file=FIXTURE):
        for key in ("source", "file_name", "payload", "mime_type", "relationship", "language", "primary", "cv_version"):
            assert key in doc.metadata, f"missing metadata key {key} on {doc.metadata.get('payload')}"


def test_exactly_one_primary_document(reader: CVFileReader) -> None:
    primaries = [d for d in reader.load_data(file=FIXTURE) if d.metadata["primary"]]
    assert len(primaries) == 1


def test_primary_is_text_content(reader: CVFileReader) -> None:
    primary = next(d for d in reader.load_data(file=FIXTURE) if d.metadata["primary"])
    assert primary.text.strip(), "primary document should not be empty"
    assert primary.metadata["mime_type"].startswith(("text/", "application/json"))


def test_extra_info_is_merged(reader: CVFileReader) -> None:
    docs = reader.load_data(file=FIXTURE, extra_info={"tenant": "acme"})
    assert all(d.metadata.get("tenant") == "acme" for d in docs)


def test_chunks_mode_attaches_a_vector_per_chunk() -> None:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    docs = CVFileReader(mode="chunks").load_data(file=FIXTURE)
    assert len(docs) >= 1
    for doc in docs:
        assert doc.embedding is not None
        assert len(doc.embedding) == doc.metadata["embedding_dimension"]
        assert all(isinstance(v, float) for v in doc.embedding)
        assert doc.text.strip(), "chunk text should not be empty"


def test_invalid_mode_rejected() -> None:
    with pytest.raises(ValueError):
        CVFileReader(mode="bogus")


def test_verify_rejects_malicious_file() -> None:
    if not MALICIOUS_FIXTURE.exists():
        pytest.skip(f"fixture not found: {MALICIOUS_FIXTURE}")
    with pytest.raises(ValueError, match="javascript-action"):
        CVFileReader().load_data(file=MALICIOUS_FIXTURE)


def test_verify_false_loads_malicious_file() -> None:
    if not MALICIOUS_FIXTURE.exists():
        pytest.skip(f"fixture not found: {MALICIOUS_FIXTURE}")
    docs = CVFileReader(verify=False).load_data(file=MALICIOUS_FIXTURE)
    assert len(docs) >= 1


def test_verify_default_passes_on_valid_file() -> None:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    reader = CVFileReader()
    assert reader.verify is True
    assert len(reader.load_data(file=FIXTURE)) >= 1


def test_non_ascii_chunk_text_slices_on_byte_offsets() -> None:
    if not UNICODE_FIXTURE.exists():
        pytest.skip(f"fixture not found: {UNICODE_FIXTURE}")
    docs = CVFileReader(mode="chunks").load_data(file=UNICODE_FIXTURE)
    joined = "".join(d.text for d in docs)
    assert "Élodie" in joined
    assert "工程師" in joined
    assert "🚀" in joined
    assert "经验" in joined
    for doc in docs:
        assert doc.text == doc.text.encode("utf-8").decode("utf-8")
