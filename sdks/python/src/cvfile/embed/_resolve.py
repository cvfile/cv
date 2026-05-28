"""Resolve a .cv file's embeddings.cbor payload into per-chunk vectors.

This is the single source of truth shared by every RAG-framework integration
(the bundled cvfile.integrations.* and the standalone langchain-cvfile,
llama-index-readers-cvfile and cvfile-haystack packages). It decodes the
embeddings.cbor payload, then slices the corresponding chunk text out of the
markdown payload using UTF-8 BYTE offsets (spec §5.1), never code-point indices,
so a chunk emitted by one SDK indexes back into the same source bytes here.
"""

from __future__ import annotations

from dataclasses import dataclass

from cvfile._constants import DEFAULT_PAYLOAD_NAMES, PAYLOAD_MIME_TYPES
from cvfile._types import CvFile
from cvfile.embed._embeddings import decode_embeddings


@dataclass(frozen=True, slots=True)
class ResolvedChunk:
    """One embedding chunk with its text sliced back out of the markdown."""

    id: str
    text: str
    text_offset: int
    text_length: int
    vector: tuple[float, ...]
    model: str
    dimension: int
    metric: str


def resolve_embedding_chunks(file: CvFile) -> list[ResolvedChunk]:
    """Return the file's first embedding space as text-resolved chunks.

    Returns an empty list when the file carries no embeddings.cbor payload or
    no markdown to index into, so callers can cleanly fall back to whole-payload
    behaviour.
    """
    cbor_bytes = next(
        (p.bytes_ for p in file.payloads if p.name == DEFAULT_PAYLOAD_NAMES["embeddings"]),
        None,
    )
    if cbor_bytes is None:
        return []

    payload = decode_embeddings(cbor_bytes)
    if not payload.spaces:
        return []
    space = payload.spaces[0]

    markdown_bytes = _markdown_bytes(file)
    if markdown_bytes is None:
        return []

    return [
        ResolvedChunk(
            id=chunk.id,
            text=markdown_bytes[chunk.text_offset : chunk.text_offset + chunk.text_length].decode("utf-8"),
            text_offset=chunk.text_offset,
            text_length=chunk.text_length,
            vector=chunk.vector,
            model=space.model,
            dimension=space.dimension,
            metric=space.metric,
        )
        for chunk in space.chunks
    ]


def _markdown_bytes(file: CvFile) -> bytes | None:
    for p in file.payloads:
        if p.mime_type == PAYLOAD_MIME_TYPES["markdown"]:
            return p.bytes_
    return None
