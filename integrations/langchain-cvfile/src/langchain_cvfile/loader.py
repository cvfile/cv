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
            "language": payload.language or file.metadata.primary_language,
            "primary": payload.name == file.metadata.primary_payload,
            "cv_version": file.metadata.version,
            "cv_generator": file.metadata.generator,
        },
    )


class CVFileLoader(BaseLoader):
    """Load a ``.cv`` file and emit one ``Document`` per embedded text payload.

    A ``.cv`` file is a PDF/A-3u with Markdown, HTML, and optional JSON
    payloads attached via PDF Associated Files. This loader returns one
    ``Document`` per textual payload (the visual PDF layer is intentionally
    skipped: the embedded Markdown is a cleaner text representation of the
    same content, which is the whole point of the format).

    The payload marked as ``primaryPayload`` in the file's XMP metadata is
    flagged in ``metadata["primary"] = True`` so downstream code can keep
    just the canonical text and drop alternates if needed.
    """

    def __init__(self, file_path: Union[str, Path]) -> None:
        self.file_path = Path(file_path)

    def lazy_load(self) -> Iterator[Document]:
        data = self.file_path.read_bytes()
        file = extract(data)
        source = str(self.file_path)
        for payload in file.payloads:
            if not _is_text_payload(payload):
                continue
            yield _payload_to_document(payload, file, source)
