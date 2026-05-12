"""Smoke tests for the LlamaIndex CV file reader against a real fixture."""

from __future__ import annotations

from pathlib import Path

import pytest
from llama_index.core.schema import Document

from llama_index.readers.cvfile import CVFileReader

FIXTURE = Path(__file__).parents[3] / "packages" / "sdk-js" / "tests" / "fixtures" / "python-produced.cv"


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
