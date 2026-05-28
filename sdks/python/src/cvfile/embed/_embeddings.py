"""CBOR codec for the embeddings.cbor payload (spec §5).

Schema mirrors @cvfile/sdk: kebab-case keys on the wire, snake_case in
Python. Vectors are stored as little-endian float32 byte runs to match
the JS encoder byte-for-byte.
"""

from __future__ import annotations

import array
import struct
from dataclasses import dataclass, field
from typing import Literal

import cbor2

EmbeddingMetric = Literal["cosine", "dot", "euclidean"]
ChunkingMode = Literal["document", "section", "paragraph"]

_CURRENT_FORMAT_VERSION = 1


@dataclass(frozen=True, slots=True)
class EmbeddingChunk:
    id: str
    text_offset: int
    text_length: int
    vector: tuple[float, ...]


@dataclass(frozen=True, slots=True)
class EmbeddingSpace:
    model: str
    model_revision: str
    dimension: int
    metric: EmbeddingMetric
    normalized: bool
    chunking: ChunkingMode
    chunks: tuple[EmbeddingChunk, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class EmbeddingsPayload:
    spaces: tuple[EmbeddingSpace, ...]
    format_version: int = _CURRENT_FORMAT_VERSION


def encode_embeddings(payload: EmbeddingsPayload) -> bytes:
    for space in payload.spaces:
        _validate_space(space)
    cbor_payload = {
        "format-version": payload.format_version or _CURRENT_FORMAT_VERSION,
        "spaces": [_to_cbor_space(s) for s in payload.spaces],
    }
    return cbor2.dumps(cbor_payload)


def decode_embeddings(data: bytes) -> EmbeddingsPayload:
    raw = cbor2.loads(data)
    if not isinstance(raw, dict):
        raise ValueError("Invalid embeddings payload: not a map")
    fmt = raw.get("format-version")
    if not isinstance(fmt, int):
        raise ValueError("Invalid embeddings payload: missing format-version")
    if fmt > _CURRENT_FORMAT_VERSION:
        raise ValueError(
            f"Unsupported embeddings format version {fmt} (this SDK supports up to {_CURRENT_FORMAT_VERSION})"
        )
    spaces_raw = raw.get("spaces")
    if not isinstance(spaces_raw, list):
        raise ValueError("Invalid embeddings payload: spaces is not an array")
    return EmbeddingsPayload(
        format_version=fmt,
        spaces=tuple(_from_cbor_space(s) for s in spaces_raw),
    )


def _to_cbor_space(space: EmbeddingSpace) -> dict[str, object]:
    return {
        "model": space.model,
        "model-revision": space.model_revision,
        "dimension": space.dimension,
        "metric": space.metric,
        "normalized": space.normalized,
        "chunking": space.chunking,
        "chunks": [_to_cbor_chunk(c, space.dimension) for c in space.chunks],
    }


def _from_cbor_space(raw: object) -> EmbeddingSpace:
    if not isinstance(raw, dict):
        raise ValueError("Embedding space must be a map")
    dimension = raw.get("dimension")
    if not isinstance(dimension, int) or dimension <= 0:
        raise ValueError("Embedding space dimension must be a positive integer")
    return EmbeddingSpace(
        model=str(raw["model"]),
        model_revision=str(raw["model-revision"]),
        dimension=dimension,
        metric=raw.get("metric", "cosine"),
        normalized=bool(raw.get("normalized", True)),
        chunking=raw.get("chunking", "section"),
        chunks=tuple(_from_cbor_chunk(c, dimension) for c in raw.get("chunks", [])),
    )


def _to_cbor_chunk(chunk: EmbeddingChunk, dimension: int) -> dict[str, object]:
    if len(chunk.vector) != dimension:
        raise ValueError(
            f'Chunk "{chunk.id}" vector length {len(chunk.vector)} does not match space dimension {dimension}'
        )
    return {
        "id": chunk.id,
        "text-offset": chunk.text_offset,
        "text-length": chunk.text_length,
        "vector": _float32_to_bytes(chunk.vector),
    }


def _from_cbor_chunk(raw: object, dimension: int) -> EmbeddingChunk:
    if not isinstance(raw, dict):
        raise ValueError("Chunk must be a map")
    vector_bytes = _unwrap_bytes(raw.get("vector"))
    if vector_bytes is None:
        raise ValueError("Chunk vector must be bytes")
    vector = _bytes_to_float32(vector_bytes)
    if len(vector) != dimension:
        raise ValueError(
            f'Chunk "{raw.get("id")}" vector length {len(vector)} does not match space dimension {dimension}'
        )
    return EmbeddingChunk(
        id=str(raw["id"]),
        text_offset=int(raw["text-offset"]),
        text_length=int(raw["text-length"]),
        vector=vector,
    )


def _validate_space(space: EmbeddingSpace) -> None:
    if not space.model:
        raise ValueError("Embedding space missing model")
    if not space.model_revision:
        raise ValueError(f'Embedding space "{space.model}" missing model_revision')
    if not isinstance(space.dimension, int) or space.dimension <= 0:
        raise ValueError(f'Embedding space "{space.model}" dimension must be a positive integer')
    if space.metric not in ("cosine", "dot", "euclidean"):
        raise ValueError(f'Embedding space "{space.model}" has invalid metric "{space.metric}"')
    if space.chunking not in ("document", "section", "paragraph"):
        raise ValueError(f'Embedding space "{space.model}" has invalid chunking "{space.chunking}"')
    if not space.chunks:
        raise ValueError(f'Embedding space "{space.model}" must contain at least one chunk')


def _float32_to_bytes(vec: tuple[float, ...]) -> bytes:
    arr = array.array("f", vec)
    return arr.tobytes()


def _unwrap_bytes(value: object) -> bytes | None:
    """JS producers (cbor-x) tag Uint8Array as CBOR Tag 64 per RFC 8746;
    cbor2 returns this as a CBORTag wrapper. Unwrap to raw bytes regardless
    of the encoder's choice.
    """
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    inner = getattr(value, "value", None)
    if isinstance(inner, (bytes, bytearray)):
        return bytes(inner)
    return None


def _bytes_to_float32(b: bytes) -> tuple[float, ...]:
    if len(b) % 4 != 0:
        raise ValueError("Vector byte length must be a multiple of 4")
    count = len(b) // 4
    return struct.unpack(f"<{count}f", b)
