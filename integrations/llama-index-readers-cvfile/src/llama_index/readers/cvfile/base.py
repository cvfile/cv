"""LlamaIndex ``BaseReader`` implementation for the .cv open file format."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from cvfile import CvFile, ExtractedPayload, extract
from llama_index.core.readers.base import BaseReader
from llama_index.core.schema import Document

_TEXT_MIME_PREFIXES: tuple[str, ...] = (
    "text/",
    "application/json",
    "application/xml",
)


def _is_text_payload(payload: ExtractedPayload) -> bool:
    return any(payload.mime_type.startswith(prefix) for prefix in _TEXT_MIME_PREFIXES)


def _payload_to_document(
    payload: ExtractedPayload,
    file: CvFile,
    source: str,
    extra_info: Optional[dict] = None,
) -> Document:
    metadata: dict = {
        "source": source,
        "file_name": Path(source).name,
        "mime_type": payload.mime_type,
        "payload": payload.name,
        "relationship": payload.relationship,
        "language": payload.language or file.metadata.primary_language,
        "primary": payload.name == file.metadata.primary_payload,
        "cv_version": file.metadata.version,
        "cv_generator": file.metadata.generator,
    }
    if extra_info:
        metadata.update(extra_info)
    return Document(text=payload.text(), metadata=metadata)


class CVFileReader(BaseReader):
    """Read a ``.cv`` file and emit one ``Document`` per embedded text payload.

    A ``.cv`` file is a PDF/A-3u carrying Markdown, HTML, and optional JSON
    payloads via PDF Associated Files. This reader returns one ``Document``
    per textual payload (the visual PDF layer is skipped because the embedded
    Markdown is a cleaner text representation of the same content).
    """

    def load_data(
        self,
        file: Path,
        extra_info: Optional[dict] = None,
    ) -> list[Document]:
        path = Path(file)
        cv_file = extract(path.read_bytes())
        source = str(path)
        return [
            _payload_to_document(payload, cv_file, source, extra_info)
            for payload in cv_file.payloads
            if _is_text_payload(payload)
        ]
