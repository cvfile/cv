"""Hugging Face Inference API embedding backend."""

from __future__ import annotations

import math
import os
from dataclasses import dataclass

import httpx

_DEFAULT_BASE_URL = "https://router.huggingface.co/hf-inference/models"


@dataclass(slots=True)
class HuggingFaceBackend:
    model: str
    token: str | None = None
    model_revision: str = "main"
    metric: str = "cosine"
    normalized: bool = True
    base_url: str = _DEFAULT_BASE_URL
    dimension: int | None = None
    timeout: float = 120.0

    def __post_init__(self) -> None:
        if not self.token:
            self.token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
        if not self.token:
            raise ValueError("HF_TOKEN (or HUGGINGFACE_TOKEN) is required for the Hugging Face backend")
        if not self.model:
            raise ValueError("model is required")

    def embed(self, texts: list[str]) -> tuple[list[tuple[float, ...]], int]:
        if not texts:
            return [], self.dimension or 0
        url = f"{self.base_url}/{self.model}/pipeline/feature-extraction"
        headers = {
            "content-type": "application/json",
            "authorization": f"Bearer {self.token}",
        }
        body = {"inputs": texts, "options": {"wait_for_model": True}}
        with httpx.Client(timeout=self.timeout) as client:
            res = client.post(url, headers=headers, json=body)
        if res.status_code != 200:
            snippet = res.text[:300]
            raise RuntimeError(f"HF Inference API {res.status_code} for {self.model}: {snippet}")
        matrix = _parse_hf_matrix(res.json(), len(texts))
        normalised = [_normalize(v) for v in matrix]
        dim = len(normalised[0]) if normalised else (self.dimension or 0)
        return normalised, dim


def _parse_hf_matrix(raw: object, expected: int) -> list[tuple[float, ...]]:
    if not isinstance(raw, list):
        raise ValueError("HF response: expected list at top level")
    if not raw:
        return []
    first = raw[0]
    if isinstance(first, (int, float)):
        if expected != 1:
            raise ValueError(f"HF returned 1 vector, expected {expected}")
        return [tuple(float(x) for x in raw)]
    if isinstance(first, list):
        if not first or isinstance(first[0], (int, float)):
            return [tuple(float(x) for x in row) for row in raw]
        if isinstance(first[0], list):
            # Token-level embeddings: mean-pool per input.
            return [_mean_pool(row) for row in raw]
    raise ValueError("HF response: unrecognised shape")


def _mean_pool(tokens: list[list[float]]) -> tuple[float, ...]:
    if not tokens:
        return ()
    dim = len(tokens[0])
    sums = [0.0] * dim
    for row in tokens:
        for i, v in enumerate(row):
            sums[i] += float(v)
    n = len(tokens)
    return tuple(s / n for s in sums)


def _normalize(v: tuple[float, ...]) -> tuple[float, ...]:
    norm = math.sqrt(sum(x * x for x in v))
    if norm == 0:
        return v
    return tuple(x / norm for x in v)
