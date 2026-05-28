"""LangChain ``BaseLoader`` implementation for the .cv open file format."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Union

from cvfile import CvFile, ExtractedPayload, extract
from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document

_TEXT_MIME_PREFIXES: tuple[str, ...] = (
    "text/",
    "application/json",
    "application/xml",
)


def _is_text_payload(payload: ExtractedPayload) -> bool:
    return any(payload.mime_type.startswith(prefix) for prefix in _TEXT_MIME_PREFIXES)


def _payload_to_document(payload: ExtractedPayload, file: CvFile, source: str) -> Document:
    return Document(
        page_content=payload.text(),
        metadata={
            "source": source,
            "mime_type": payload.mime_type,
            "payload": payload.name,
            "relationship": payload.relationship,
            "language": payload.language,
            "primary": payload.name == file.metadata.primary_payload,
            "cv_version": file.metadata.version,
            "cv_generator": file.metadata.generator,
        },
    )


def _resolve_chunks(file: CvFile) -> list:
    """Decode the file's embeddings.cbor into text-resolved chunks.

    Delegates to the core SDK so chunk text slicing uses UTF-8 byte offsets
    (spec §5.1) and stays the single source of truth. Returns an empty list
    when the embed extra is not installed or the file carries no embeddings.
    """
    try:
        from cvfile.embed import resolve_embedding_chunks
    except ImportError:
        return []
    return resolve_embedding_chunks(file)


class CVFileLoader(BaseLoader):
    """Load a ``.cv`` file and emit ``Document`` objects.

    A ``.cv`` file is a PDF/A-3u with Markdown, HTML, and optional JSON
    payloads attached via PDF Associated Files. The visual PDF layer is
    intentionally skipped: the embedded Markdown is a cleaner text
    representation of the same content, which is the whole point of the format.

    Two modes are supported:

    - ``mode="payloads"`` (default): one ``Document`` per textual payload. The
      payload marked as ``primaryPayload`` in the file's XMP metadata is flagged
      in ``metadata["primary"] = True`` so downstream code can keep just the
      canonical text and drop alternates if needed.
    - ``mode="chunks"``: one ``Document`` per pre-computed embedding chunk, with
      the chunk's vector attached as ``metadata["embedding"]`` and the chunk
      text sliced from the markdown using UTF-8 byte offsets. Falls back to a
      single Markdown ``Document`` when the file carries no embeddings.
    """

    def __init__(self, file_path: Union[str, Path], *, mode: str = "payloads") -> None:
        if mode not in ("payloads", "chunks"):
            raise ValueError("mode must be 'payloads' or 'chunks'")
        self.file_path = Path(file_path)
        self.mode = mode

    def lazy_load(self) -> Iterator[Document]:
        data = self.file_path.read_bytes()
        file = extract(data)
        source = str(self.file_path)

        if self.mode == "chunks":
            yield from self._lazy_load_chunks(file, source)
            return

        for payload in file.payloads:
            if not _is_text_payload(payload):
                continue
            yield _payload_to_document(payload, file, source)

    def _lazy_load_chunks(self, file: CvFile, source: str) -> Iterator[Document]:
        chunks = _resolve_chunks(file)
        if not chunks:
            # No precomputed embeddings: fall back to the primary text payload.
            primary = next(
                (p for p in file.payloads if p.name == file.metadata.primary_payload and _is_text_payload(p)),
                None,
            )
            if primary is not None:
                yield _payload_to_document(primary, file, source)
            return

        for chunk in chunks:
            yield Document(
                page_content=chunk.text,
                metadata={
                    "source": source,
                    "language": file.metadata.primary_language,
                    "cv_version": file.metadata.version,
                    "cv_generator": file.metadata.generator,
                    "chunk_id": chunk.id,
                    "chunk_offset": chunk.text_offset,
                    "chunk_length": chunk.text_length,
                    "embedding": list(chunk.vector),
                    "embedding_model": chunk.model,
                    "embedding_dimension": chunk.dimension,
                    "embedding_metric": chunk.metric,
                },
            )
