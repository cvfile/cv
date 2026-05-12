"""Smoke tests for the LangChain CV file loader against a real fixture."""

from __future__ import annotations

from pathlib import Path

import pytest
from langchain_core.documents import Document

from langchain_cvfile import CVFileLoader

FIXTURE = Path(__file__).parents[3] / "packages" / "sdk-js" / "tests" / "fixtures" / "python-produced.cv"


@pytest.fixture(scope="module")
def loader() -> CVFileLoader:
    if not FIXTURE.exists():
        pytest.skip(f"fixture not found: {FIXTURE}")
    return CVFileLoader(FIXTURE)


def test_loader_returns_documents(loader: CVFileLoader) -> None:
    docs = loader.load()
    assert len(docs) >= 1
    assert all(isinstance(d, Document) for d in docs)


def test_each_document_has_required_metadata(loader: CVFileLoader) -> None:
    for doc in loader.load():
        for key in ("source", "payload", "mime_type", "relationship", "language", "primary", "cv_version"):
            assert key in doc.metadata, f"missing metadata key {key} on {doc.metadata.get('payload')}"


def test_exactly_one_primary_document(loader: CVFileLoader) -> None:
    primaries = [d for d in loader.load() if d.metadata["primary"]]
    assert len(primaries) == 1


def test_primary_is_text_content(loader: CVFileLoader) -> None:
    primary = next(d for d in loader.load() if d.metadata["primary"])
    assert primary.page_content.strip(), "primary document should not be empty"
    assert primary.metadata["mime_type"].startswith(("text/", "application/json"))


def test_lazy_load_is_streaming(loader: CVFileLoader) -> None:
    it = loader.lazy_load()
    first = next(it)
    assert isinstance(first, Document)
