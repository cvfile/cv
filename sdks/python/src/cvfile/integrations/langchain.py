"""LangChain document loader for `.cv` files.

Each `.cv` becomes one Document whose ``page_content`` is the markdown
payload and whose ``metadata`` carries the spec metadata plus, when
present, per-section embedding chunks indexed back into the markdown.

Install LangChain separately: ``pip install langchain-core``.

Example::

    from cvfile.integrations.langchain import CvFileLoader
    docs = CvFileLoader("resume.cv").load()
    print(docs[0].metadata["primary_language"])  # 'en'
    print(docs[0].metadata["embeddings"])        # [{model, dimension, chunks: N}, ...]
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING, Any

from cvfile.extract import extract

if TYPE_CHECKING:
    from langchain_core.documents import Document


class CvFileLoader:
    """LangChain BaseLoader-compatible loader for `.cv` files.

    Yields one Document per file by default. Pass ``mode="chunks"`` to emit
    one Document per markdown section, with each Document's metadata carrying
    the corresponding pre-computed embedding (when the file has an
    embeddings.cbor payload).
    """

    def __init__(self, path: str | Path, *, mode: str = "document") -> None:
        if mode not in ("document", "chunks"):
            raise ValueError("mode must be 'document' or 'chunks'")
        self.path = Path(path)
        self.mode = mode

    def load(self) -> list[Document]:
        return list(self.lazy_load())

    def lazy_load(self) -> Iterator[Document]:
        try:
            from langchain_core.documents import Document
        except ImportError as e:  # pragma: no cover - import guard only
            raise ImportError(
                "LangChain is required: pip install langchain-core"
            ) from e

        data = self.path.read_bytes()
        file = extract(data)

        markdown = self._markdown_payload(file)
        base_metadata = self._base_metadata(file)

        if self.mode == "document":
            yield Document(page_content=markdown, metadata=base_metadata)
            return

        # chunks mode: emit one Document per embedding chunk if the .cv
        # carries embeddings, otherwise fall back to a single document.
        chunks = self._embedding_chunks(file)
        if not chunks:
            yield Document(page_content=markdown, metadata=base_metadata)
            return

        for chunk in chunks:
            md = dict(base_metadata)
            md.update(
                {
                    "chunk_id": chunk.id,
                    "chunk_offset": chunk.text_offset,
                    "chunk_length": chunk.text_length,
                    "embedding": list(chunk.vector),
                    "embedding_model": chunk.model,
                    "embedding_dimension": chunk.dimension,
                }
            )
            yield Document(page_content=chunk.text, metadata=md)

    @staticmethod
    def _markdown_payload(file: Any) -> str:
        for p in file.payloads:
            if p.mime_type == "text/markdown":
                decoded: str = p.bytes_.decode("utf-8", errors="replace")
                return decoded
        return ""

    @staticmethod
    def _base_metadata(file: Any) -> dict[str, Any]:
        meta = file.metadata
        return {
            "source": "cv",
            "cv_version": meta.version,
            "primary_language": meta.primary_language,
            "primary_payload": meta.primary_payload,
            "generator": getattr(meta, "generator", None),
            "alternates": [
                {"payload": a.payload, "language": a.language, "mime_type": a.mime_type}
                for a in meta.alternates
            ],
            "embeddings": [
                {
                    "model": s.model,
                    "dimension": s.dimension,
                    "metric": s.metric,
                    "chunks": s.chunks,
                }
                for s in meta.embeddings
            ],
        }

    @staticmethod
    def _embedding_chunks(file: Any) -> list[Any]:
        try:
            from cvfile.embed import resolve_embedding_chunks
        except ImportError:
            return []
        try:
            return resolve_embedding_chunks(file)
        except Exception:
            return []
