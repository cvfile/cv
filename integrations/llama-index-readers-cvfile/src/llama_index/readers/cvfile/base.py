"""LlamaIndex ``BaseReader`` implementation for the .cv open file format."""

from __future__ import annotations

from pathlib import Path

from llama_index.core.readers.base import BaseReader
from llama_index.core.schema import Document

from cvfile import CvFile, ExtractedPayload, extract, validate

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
    extra_info: dict | None = None,
) -> Document:
    metadata: dict = {
        "source": source,
        "file_name": Path(source).name,
        "mime_type": payload.mime_type,
        "payload": payload.name,
        "relationship": payload.relationship,
        "language": payload.language,
        "primary": payload.name == file.metadata.primary_payload,
        "cv_version": file.metadata.version,
        "cv_generator": file.metadata.generator,
    }
    if extra_info:
        metadata.update(extra_info)
    return Document(text=payload.text(), metadata=metadata)


def _verify_cv(data: bytes, source: str) -> None:
    """Refuse to load a .cv file that fails ``cvfile.validate()`` (lenient level).

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


class CVFileReader(BaseReader):
    """Read a ``.cv`` file and emit ``Document`` objects.

    A ``.cv`` file is a PDF/A-3u carrying Markdown, HTML, and optional JSON
    payloads via PDF Associated Files. The visual PDF layer is skipped because
    the embedded Markdown is a cleaner text representation of the same content.

    Two modes are supported:

    - ``mode="payloads"`` (default): one ``Document`` per textual payload.
    - ``mode="chunks"``: one ``Document`` per pre-computed embedding chunk, with
      the chunk's vector attached on ``Document.embedding`` and the chunk text
      sliced from the markdown using UTF-8 byte offsets. Falls back to a single
      Markdown ``Document`` when the file carries no embeddings.

    By default (``verify=True``) each file is checked with ``cvfile.validate()``
    before extraction: files carrying forbidden active content (JavaScript,
    launch or submit actions, external references), encryption, integrity
    digest mismatches, or oversized payloads raise ``ValueError`` listing the
    issue codes. Set ``verify=False`` to skip the check for trusted files only.
    """

    def __init__(self, *, mode: str = "payloads", verify: bool = True) -> None:
        if mode not in ("payloads", "chunks"):
            raise ValueError("mode must be 'payloads' or 'chunks'")
        self.mode = mode
        self.verify = verify

    def load_data(
        self,
        file: Path,
        extra_info: dict | None = None,
    ) -> list[Document]:
        path = Path(file)
        data = path.read_bytes()
        source = str(path)
        if self.verify:
            _verify_cv(data, source)
        cv_file = extract(data)

        if self.mode == "chunks":
            return self._load_chunks(cv_file, source, extra_info)

        return [
            _payload_to_document(payload, cv_file, source, extra_info)
            for payload in cv_file.payloads
            if _is_text_payload(payload)
        ]

    def _load_chunks(
        self,
        cv_file: CvFile,
        source: str,
        extra_info: dict | None,
    ) -> list[Document]:
        chunks = _resolve_chunks(cv_file)
        if not chunks:
            primary = next(
                (
                    p
                    for p in cv_file.payloads
                    if p.name == cv_file.metadata.primary_payload and _is_text_payload(p)
                ),
                None,
            )
            if primary is None:
                return []
            return [_payload_to_document(primary, cv_file, source, extra_info)]

        out: list[Document] = []
        for chunk in chunks:
            metadata: dict = {
                "source": source,
                "file_name": Path(source).name,
                "language": cv_file.metadata.primary_language,
                "cv_version": cv_file.metadata.version,
                "cv_generator": cv_file.metadata.generator,
                "chunk_id": chunk.id,
                "chunk_offset": chunk.text_offset,
                "chunk_length": chunk.text_length,
                "embedding_model": chunk.model,
                "embedding_dimension": chunk.dimension,
                "embedding_metric": chunk.metric,
            }
            if extra_info:
                metadata.update(extra_info)
            doc = Document(text=chunk.text, metadata=metadata)
            doc.embedding = list(chunk.vector)
            out.append(doc)
        return out
