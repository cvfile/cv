"""Pure cosine/dot/euclidean similarity search over an EmbeddingsPayload."""

from __future__ import annotations

import math
from dataclasses import dataclass

from cvfile.embed._embeddings import EmbeddingsPayload, EmbeddingSpace


@dataclass(frozen=True, slots=True)
class SearchHit:
    space_model: str
    chunk_id: str
    text_offset: int
    text_length: int
    score: float


@dataclass(frozen=True, slots=True)
class SearchOptions:
    model: str | None = None
    k: int = 5


def search_semantic(
    payload: EmbeddingsPayload,
    query_vector: tuple[float, ...] | list[float],
    *,
    model: str | None = None,
    k: int = 5,
) -> list[SearchHit]:
    if not payload.spaces:
        raise ValueError("No embedding spaces in payload")
    space = _pick_space(payload, model)
    if space is None:
        raise ValueError(f"No embedding space matches model {model!r}")
    query = tuple(float(x) for x in query_vector)
    if len(query) != space.dimension:
        raise ValueError(
            f"Query vector dimension {len(query)} does not match space {space.model} ({space.dimension})"
        )

    hits = [
        SearchHit(
            space_model=space.model,
            chunk_id=c.id,
            text_offset=c.text_offset,
            text_length=c.text_length,
            score=_similarity(query, c.vector, space.metric),
        )
        for c in space.chunks
    ]
    reverse = space.metric != "euclidean"
    hits.sort(key=lambda h: h.score, reverse=reverse)
    return hits[:k]


def _pick_space(payload: EmbeddingsPayload, model: str | None) -> EmbeddingSpace | None:
    if model is None:
        return payload.spaces[0]
    for s in payload.spaces:
        if s.model == model:
            return s
    return None


def _similarity(a: tuple[float, ...], b: tuple[float, ...], metric: str) -> float:
    if metric == "euclidean":
        return math.sqrt(sum((ai - bi) ** 2 for ai, bi in zip(a, b)))
    dot = sum(ai * bi for ai, bi in zip(a, b))
    if metric == "dot":
        return dot
    na = math.sqrt(sum(ai * ai for ai in a))
    nb = math.sqrt(sum(bi * bi for bi in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
