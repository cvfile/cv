"""Integration loader tests (LangChain / LlamaIndex).

These verify that chunk text is sliced out of the markdown using UTF-8 BYTE
offsets (spec §5.1), so multibyte resumes reconstruct correctly. The third
party Document classes are stubbed via sys.modules so the test runs without
installing langchain-core / llama-index-core.
"""

from __future__ import annotations

import io
import sys
import types
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pypdf
import pytest

from cvfile import pack
from cvfile.embed import EmbedOptions, embed, encode_embeddings

MULTIBYTE_MD = """# Café résumé 📄

Développeur sénior basé à Montréal.

## Expérience 日本語

- Œuvre Inc 2022 à 2026 🚀
- Naïve SA 2018 à 2022

## Compétences

Python, Go, 中文 et plus.
"""


class _IdentityBackend:
    """Deterministic backend: every chunk maps to a fixed 2-d vector."""

    model = "test/identity"
    model_revision = "main"
    metric = "cosine"
    normalized = True

    def embed(self, texts: list[str]) -> tuple[list[tuple[float, ...]], int]:
        return [(float(i), float(len(t))) for i, t in enumerate(texts)], 2


def _blank_pdf() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=300, height=400)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture
def multibyte_cv(tmp_path: Path) -> Path:
    payload = embed(MULTIBYTE_MD, EmbedOptions(backend=_IdentityBackend()))
    cv = pack(
        pdf=_blank_pdf(),
        markdown=MULTIBYTE_MD,
        embeddings=encode_embeddings(payload),
        metadata={"primary_language": "fr", "primary_payload": "resume.md"},
    )
    path = tmp_path / "multibyte.cv"
    path.write_bytes(cv)
    return path


@dataclass
class _StubDocument:
    page_content: str | None = None
    text: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    embedding: list[float] | None = None

    def __init__(self, page_content: str | None = None, *, text: str | None = None, metadata: Any = None) -> None:
        self.page_content = page_content
        self.text = text if text is not None else page_content
        self.metadata = metadata or {}
        self.embedding = None


@pytest.fixture
def stub_langchain(monkeypatch: pytest.MonkeyPatch) -> None:
    mod = types.ModuleType("langchain_core")
    docs = types.ModuleType("langchain_core.documents")
    docs.Document = _StubDocument  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "langchain_core", mod)
    monkeypatch.setitem(sys.modules, "langchain_core.documents", docs)


@pytest.fixture
def stub_llamaindex(monkeypatch: pytest.MonkeyPatch) -> None:
    root = types.ModuleType("llama_index")
    core = types.ModuleType("llama_index.core")
    schema = types.ModuleType("llama_index.core.schema")
    schema.Document = _StubDocument  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "llama_index", root)
    monkeypatch.setitem(sys.modules, "llama_index.core", core)
    monkeypatch.setitem(sys.modules, "llama_index.core.schema", schema)


def test_langchain_chunks_slice_utf8_bytes(multibyte_cv: Path, stub_langchain: None) -> None:
    from cvfile.integrations.langchain import CvFileLoader

    docs = CvFileLoader(multibyte_cv, mode="chunks").load()
    md_bytes = MULTIBYTE_MD.encode("utf-8")
    assert len(docs) >= 3
    for d in docs:
        off = d.metadata["chunk_offset"]
        length = d.metadata["chunk_length"]
        assert md_bytes[off : off + length].decode("utf-8") == d.page_content
    # Prove non-ASCII actually survived (e.g. the accented heading chunk).
    assert any("Café résumé" in (d.page_content or "") for d in docs)


def test_llamaindex_chunks_slice_utf8_bytes(multibyte_cv: Path, stub_llamaindex: None) -> None:
    from cvfile.integrations.llamaindex import CvFileReader

    docs = CvFileReader(mode="chunks").load_data(multibyte_cv)
    md_bytes = MULTIBYTE_MD.encode("utf-8")
    assert len(docs) >= 3
    for d in docs:
        off = d.metadata["chunk_offset"]
        length = d.metadata["chunk_length"]
        assert md_bytes[off : off + length].decode("utf-8") == d.text
    assert any("日本語" in (d.text or "") for d in docs)
