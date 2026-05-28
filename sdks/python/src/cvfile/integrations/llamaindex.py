"""LlamaIndex reader for `.cv` files.

Install LlamaIndex separately: ``pip install llama-index-core``.

Example::

    from cvfile.integrations.llamaindex import CvFileReader
    docs = CvFileReader().load_data("resume.cv")
    print(docs[0].metadata["primary_language"])
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

from cvfile.extract import extract

if TYPE_CHECKING:
    from llama_index.core.schema import Document


class CvFileReader:
    """LlamaIndex BaseReader-compatible reader for `.cv` files."""

    def __init__(self, *, mode: str = "document") -> None:
        if mode not in ("document", "chunks"):
            raise ValueError("mode must be 'document' or 'chunks'")
        self.mode = mode

    def load_data(self, file: str | Path) -> list[Document]:
        try:
            from llama_index.core.schema import Document
        except ImportError as e:  # pragma: no cover - import guard only
            raise ImportError(
                "LlamaIndex is required: pip install llama-index-core"
            ) from e

        data = Path(file).read_bytes()
        cv_file = extract(data)
        markdown = self._markdown_payload(cv_file)
        base_meta = self._base_metadata(cv_file)

        if self.mode == "document":
            return [Document(text=markdown, metadata=base_meta)]

        chunks = self._embedding_chunks(cv_file)
        if not chunks:
            return [Document(text=markdown, metadata=base_meta)]

        out: list[Document] = []
        for chunk in chunks:
            md = dict(base_meta)
            md.update(
                {
                    "chunk_id": chunk.id,
                    "chunk_offset": chunk.text_offset,
                    "chunk_length": chunk.text_length,
                    "embedding_model": chunk.model,
                    "embedding_dimension": chunk.dimension,
                }
            )
            doc = Document(text=chunk.text, metadata=md)
            doc.embedding = list(chunk.vector)
            out.append(doc)
        return out

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
