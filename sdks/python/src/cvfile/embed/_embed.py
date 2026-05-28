"""High-level embed() API: markdown → EmbeddingsPayload."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from cvfile.embed._chunk import ChunkingMode, chunk_markdown
from cvfile.embed._embeddings import (
    EmbeddingChunk,
    EmbeddingSpace,
    EmbeddingsPayload,
)
from cvfile.embed._huggingface import HuggingFaceBackend


class EmbeddingBackend(Protocol):
    model: str
    model_revision: str
    metric: str
    normalized: bool

    def embed(self, texts: list[str]) -> tuple[list[tuple[float, ...]], int]: ...


@dataclass(slots=True)
class EmbedOptions:
    model: str = "BAAI/bge-m3"
    model_revision: str | None = None
    chunking: ChunkingMode = "section"
    backend: EmbeddingBackend | None = None


def embed(markdown: str, options: EmbedOptions | None = None) -> EmbeddingsPayload:
    opts = options or EmbedOptions()
    chunks = chunk_markdown(markdown, mode=opts.chunking)

    backend: EmbeddingBackend = opts.backend or HuggingFaceBackend(
        model=opts.model,
        model_revision=opts.model_revision or "main",
    )

    vectors, dimension = backend.embed([c.text for c in chunks])
    if len(vectors) != len(chunks):
        raise RuntimeError(f"Backend returned {len(vectors)} vectors for {len(chunks)} chunks")

    embedding_chunks = tuple(
        EmbeddingChunk(
            id=chunks[i].id,
            text_offset=chunks[i].text_offset,
            text_length=chunks[i].text_length,
            vector=vectors[i],
        )
        for i in range(len(chunks))
    )

    space = EmbeddingSpace(
        model=backend.model,
        model_revision=backend.model_revision,
        dimension=dimension,
        metric=backend.metric,  # type: ignore[arg-type]
        normalized=backend.normalized,
        chunking=opts.chunking,
        chunks=embedding_chunks,
    )
    return EmbeddingsPayload(format_version=1, spaces=(space,))
