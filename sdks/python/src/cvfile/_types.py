"""Public dataclasses returned and accepted by the cvfile SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

AFRelationshipKind = Literal["Alternative", "Data", "Supplement"]


@dataclass(frozen=True, slots=True)
class Payload:
    data: bytes | str
    name: str
    mime_type: str
    language: str | None = None
    relationship: AFRelationshipKind = "Alternative"
    description: str | None = None


@dataclass(frozen=True, slots=True)
class AlternateMeta:
    payload: str
    language: str
    mime_type: str


@dataclass(frozen=True, slots=True)
class IntegrityEntry:
    payload: str
    algorithm: str
    digest: str


@dataclass(frozen=True, slots=True)
class EmbeddingSpaceSummary:
    model: str
    dimension: int
    metric: Literal["cosine", "dot", "euclidean"]
    chunks: int


@dataclass(frozen=True, slots=True)
class CvMetadata:
    version: str
    primary_language: str
    primary_payload: str
    created: datetime | None = None
    modified: datetime | None = None
    generator: str | None = None
    alternates: tuple[AlternateMeta, ...] = field(default_factory=tuple)
    integrity: tuple[IntegrityEntry, ...] = field(default_factory=tuple)
    embeddings: tuple[EmbeddingSpaceSummary, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class ExtractedPayload:
    name: str
    mime_type: str
    relationship: AFRelationshipKind
    bytes_: bytes
    language: str | None = None
    description: str | None = None

    def text(self) -> str:
        return self.bytes_.decode("utf-8")


@dataclass(frozen=True, slots=True)
class CvFile:
    bytes_: bytes
    metadata: CvMetadata
    payloads: tuple[ExtractedPayload, ...]


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    level: Literal["error", "warning"]
    message: str
    payload: str | None = None


@dataclass(frozen=True, slots=True)
class ValidationReport:
    ok: bool
    level: Literal["cv-strict", "cv-lenient"]
    issues: tuple[ValidationIssue, ...]
