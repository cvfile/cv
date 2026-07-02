"""Haystack ``@component`` converter for the .cv open file format."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from haystack import Document, component, logging
from haystack.components.converters.utils import get_bytestream_from_source, normalize_metadata
from haystack.dataclasses import ByteStream

from cvfile import CvFile, ExtractedPayload, extract, validate

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
        "language": payload.language,
        "primary": payload.name == file.metadata.primary_payload,
        "cv_version": file.metadata.version,
        "cv_generator": file.metadata.generator,
    }


def _verify_cv(data: bytes, source: str) -> None:
    """Refuse to convert a .cv file that fails ``cvfile.validate()`` (lenient level).

    Validation rejects forbidden active content (JavaScript, launch and submit
    actions, external references), encryption, integrity digest mismatches, and
    payloads over the spec size cap, which is the right default for untrusted
    input.
    """
    report = validate(data)
    if report.ok:
        return
    codes = ", ".join(sorted({issue.code for issue in report.issues if issue.level == "error"}))
    raise ValueError(
        f".cv validation failed for {source}: {codes}. "
        "The file was rejected before extraction; pass verify=False only for trusted files."
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


def _chunk_meta(chunk: Any, file: CvFile) -> dict[str, Any]:
    return {
        "language": file.metadata.primary_language,
        "cv_version": file.metadata.version,
        "cv_generator": file.metadata.generator,
        "chunk_id": chunk.id,
        "chunk_offset": chunk.text_offset,
        "chunk_length": chunk.text_length,
        "embedding_model": chunk.model,
        "embedding_dimension": chunk.dimension,
        "embedding_metric": chunk.metric,
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

    Set ``mode="chunks"`` to emit one ``Document`` per pre-computed embedding
    chunk instead of one per payload. Each chunk ``Document`` carries its vector
    on ``Document.embedding`` and its text is sliced from the markdown using
    UTF-8 byte offsets. Files without an embeddings payload fall back to a single
    Markdown ``Document``. In ``mode="chunks"`` the ``primary_only`` flag is
    ignored (chunks already index a single text payload).

    By default (``verify=True``) each source is checked with
    ``cvfile.validate()`` before extraction: files carrying forbidden active
    content (JavaScript, launch or submit actions, external references),
    encryption, integrity digest mismatches, or oversized payloads make
    ``run()`` raise ``ValueError`` listing the issue codes. Unlike unreadable
    sources, which are logged and skipped, a validation failure is a security
    signal and is never silently dropped. Set ``verify=False`` to skip the
    check for trusted files only.
    """

    def __init__(self, primary_only: bool = False, *, mode: str = "payloads", verify: bool = True) -> None:
        """Create a CVFileToDocument component.

        :param primary_only:
            If ``True``, emit only the payload marked as ``primaryPayload``
            in the file's XMP metadata. If ``False`` (default), emit one
            ``Document`` per textual payload (the primary plus any
            language alternates and supplements). Ignored in ``mode="chunks"``.
        :param mode:
            ``"payloads"`` (default) emits one ``Document`` per textual payload.
            ``"chunks"`` emits one ``Document`` per pre-computed embedding chunk
            with its vector attached.
        :param verify:
            If ``True`` (default), run ``cvfile.validate()`` on every source
            and raise ``ValueError`` when a file fails validation. Set to
            ``False`` only for trusted files.
        """
        if mode not in ("payloads", "chunks"):
            raise ValueError("mode must be 'payloads' or 'chunks'")
        self.primary_only = primary_only
        self.mode = mode
        self.verify = verify

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

        :raises ValueError:
            When ``verify=True`` (the default) and a source fails
            ``cvfile.validate()``. The message lists the validation issue
            codes.

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

            if self.verify:
                _verify_cv(bytestream.data, str(source))

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

            if self.mode == "chunks":
                documents.extend(self._chunk_documents(file, stream_meta, source_meta, source_label))
                continue

            for payload in file.payloads:
                if not _is_text_payload(payload):
                    continue
                payload_meta = _payload_meta(payload, file)
                if self.primary_only and not payload_meta["primary"]:
                    continue
                merged = {**stream_meta, **payload_meta, **source_meta, "source": source_label}
                documents.append(Document(content=payload.text(), meta=merged))

        return {"documents": documents}

    @staticmethod
    def _chunk_documents(
        file: CvFile,
        stream_meta: dict[str, Any],
        source_meta: dict[str, Any],
        source_label: str,
    ) -> list[Document]:
        chunks = _resolve_chunks(file)
        if not chunks:
            primary = next(
                (p for p in file.payloads if p.name == file.metadata.primary_payload and _is_text_payload(p)),
                None,
            )
            if primary is None:
                return []
            payload_meta = _payload_meta(primary, file)
            merged = {**stream_meta, **payload_meta, **source_meta, "source": source_label}
            return [Document(content=primary.text(), meta=merged)]

        out: list[Document] = []
        for chunk in chunks:
            merged = {**stream_meta, **_chunk_meta(chunk, file), **source_meta, "source": source_label}
            out.append(Document(content=chunk.text, meta=merged, embedding=list(chunk.vector)))
        return out
