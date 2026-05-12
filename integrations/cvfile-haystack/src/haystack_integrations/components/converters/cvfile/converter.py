"""Haystack ``@component`` converter for the .cv open file format."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from cvfile import CvFile, ExtractedPayload, extract
from haystack import Document, component, logging
from haystack.components.converters.utils import get_bytestream_from_source, normalize_metadata
from haystack.dataclasses import ByteStream

logger = logging.getLogger(__name__)

_TEXT_MIME_PREFIXES: tuple[str, ...] = (
    "text/",
    "application/json",
    "application/xml",
)


def _is_text_payload(payload: ExtractedPayload) -> bool:
    return any(payload.mime_type.startswith(prefix) for prefix in _TEXT_MIME_PREFIXES)


def _payload_meta(payload: ExtractedPayload, file: CvFile) -> dict[str, Any]:
    return {
        "mime_type": payload.mime_type,
        "payload": payload.name,
        "relationship": payload.relationship,
        "language": payload.language or file.metadata.primary_language,
        "primary": payload.name == file.metadata.primary_payload,
        "cv_version": file.metadata.version,
        "cv_generator": file.metadata.generator,
    }


@component
class CVFileToDocument:
    """Convert ``.cv`` files into Haystack ``Document`` objects.

    A ``.cv`` file is a PDF/A-3u that carries one or more textual payloads
    (Markdown, HTML, JSON) as PDF Associated Files. This converter reads
    each ``.cv`` source and emits one ``Document`` per textual payload. The
    visual PDF layer is intentionally skipped because the embedded Markdown
    is a cleaner text representation of the same content.

    Set ``primary_only=True`` to emit only the payload marked as
    ``primaryPayload`` in the file's XMP metadata (usually the canonical
    Markdown copy), and skip all alternates.
    """

    def __init__(self, primary_only: bool = False) -> None:
        """Create a CVFileToDocument component.

        :param primary_only:
            If ``True``, emit only the payload marked as ``primaryPayload``
            in the file's XMP metadata. If ``False`` (default), emit one
            ``Document`` per textual payload (the primary plus any
            language alternates and supplements).
        """
        self.primary_only = primary_only

    @component.output_types(documents=list[Document])
    def run(
        self,
        sources: list[str | Path | ByteStream],
        meta: dict[str, Any] | list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Convert a list of ``.cv`` sources into ``Document`` objects.

        :param sources:
            File paths or ``ByteStream`` objects pointing at ``.cv`` files.
        :param meta:
            Optional metadata to attach to the produced documents. A single
            dictionary is merged into every document. A list must have the
            same length as ``sources`` and is zipped one to one with the
            inputs (the same dictionary is merged into every document
            produced from that source).

        :returns:
            A dictionary with key ``documents`` containing the list of
            ``Document`` objects extracted from every source.
        """
        documents: list[Document] = []
        meta_list = normalize_metadata(meta, sources_count=len(sources))

        for source, source_meta in zip(sources, meta_list, strict=True):
            try:
                bytestream = get_bytestream_from_source(source)
            except Exception as e:
                logger.warning("Could not read {source}. Skipping it. Error: {error}", source=source, error=e)
                continue

            try:
                file = extract(bytestream.data)
            except Exception as e:
                logger.warning(
                    "Could not parse .cv file from {source}. Skipping it. Error: {error}",
                    source=source,
                    error=e,
                )
                continue

            stream_meta = bytestream.meta or {}
            source_label = stream_meta.get("file_path") or stream_meta.get("file_name") or str(source)

            for payload in file.payloads:
                if not _is_text_payload(payload):
                    continue
                payload_meta = _payload_meta(payload, file)
                if self.primary_only and not payload_meta["primary"]:
                    continue
                merged = {**stream_meta, **payload_meta, **source_meta, "source": source_label}
                documents.append(Document(content=payload.text(), meta=merged))

        return {"documents": documents}
