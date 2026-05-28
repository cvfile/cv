"""pack(): build a .cv file from a PDF + payloads + metadata."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from cvfile._constants import (
    CV_SPEC_VERSION,
    DEFAULT_GENERATOR,
    DEFAULT_PAYLOAD_NAMES,
    PAYLOAD_MIME_TYPES,
)
from cvfile._pdf import add_associated_file, load_writer, set_metadata_xml, write_to_bytes
from cvfile._types import AlternateMeta, EmbeddingSpaceSummary, IntegrityEntry, Payload
from cvfile._xmp import build_xmp


def pack(
    *,
    pdf: bytes,
    markdown: str | bytes | None = None,
    html: str | bytes | None = None,
    json_resume: Any = None,
    embeddings: Any = None,
    payloads: list[Payload] | None = None,
    metadata: dict[str, Any],
) -> bytes:
    """Build a .cv from a PDF and one or more representations.

    ``embeddings`` accepts either an ``EmbeddingsPayload`` (from
    ``cvfile.embed``) or raw encoded CBOR bytes. When given a payload object the
    per-space summary is recorded in the XMP metadata (so ``inspect`` surfaces
    it); raw bytes are stored as-is without a summary (parity with @cvfile/sdk).
    """
    embeddings_bytes, embedding_summaries = _resolve_embeddings(embeddings)
    payload_list = _collect_payloads(
        markdown=markdown,
        html=html,
        json_resume=json_resume,
        embeddings=embeddings_bytes,
        extra=payloads,
    )
    if not payload_list:
        raise ValueError("At least one payload (markdown, html, json_resume, embeddings, or payloads) is required")

    primary_language = metadata.get("primary_language")
    if not primary_language:
        raise ValueError("metadata['primary_language'] is required")

    primary_payload = metadata.get("primary_payload") or _default_primary(payload_list)
    if not any(p.name == primary_payload for p in payload_list):
        raise ValueError(f"primary_payload '{primary_payload}' not found among payloads")

    created = metadata.get("created") or datetime.now(timezone.utc)
    modified = metadata.get("modified") or created
    generator = metadata.get("generator") or DEFAULT_GENERATOR
    integrity_mode = metadata.get("integrity", "sha-256")

    integrity: list[IntegrityEntry] = []
    if integrity_mode == "sha-256":
        for p in payload_list:
            data_bytes = p.data.encode("utf-8") if isinstance(p.data, str) else p.data
            digest = hashlib.sha256(data_bytes).hexdigest()
            integrity.append(IntegrityEntry(payload=p.name, algorithm="sha-256", digest=digest))

    writer = load_writer(pdf)

    for p in payload_list:
        data_bytes = p.data.encode("utf-8") if isinstance(p.data, str) else p.data
        add_associated_file(
            writer,
            name=p.name,
            data=data_bytes,
            mime_type=p.mime_type,
            description=p.description or _default_description(p),
            relationship=p.relationship,
            creation_date=created,
            modification_date=modified,
        )

    alternates = tuple(
        AlternateMeta(payload=p.name, language=p.language or primary_language, mime_type=p.mime_type)
        for p in payload_list
        if p.name != primary_payload and p.relationship == "Alternative"
    )

    xmp = build_xmp(
        version=CV_SPEC_VERSION,
        primary_language=primary_language,
        primary_payload=primary_payload,
        created=created,
        modified=modified,
        generator=generator,
        alternates=alternates,
        integrity=tuple(integrity),
        embeddings=embedding_summaries,
    )
    set_metadata_xml(writer, xmp)

    return write_to_bytes(writer)


def _resolve_embeddings(embeddings: Any) -> tuple[bytes | None, tuple[EmbeddingSpaceSummary, ...]]:
    """Normalize the ``embeddings`` argument to (encoded bytes, summaries).

    Mirrors @cvfile/sdk's resolveEmbeddings: an ``EmbeddingsPayload`` yields both
    encoded bytes and per-space summaries, raw bytes pass through with no summary,
    and ``None`` yields ``(None, ())``.
    """
    if embeddings is None:
        return None, ()
    if isinstance(embeddings, (bytes, bytearray)):
        return bytes(embeddings), ()

    spaces = getattr(embeddings, "spaces", None)
    if spaces is None:
        raise TypeError("embeddings must be bytes or an EmbeddingsPayload")

    from cvfile.embed import encode_embeddings

    summaries = tuple(
        EmbeddingSpaceSummary(
            model=space.model,
            dimension=space.dimension,
            metric=space.metric,
            chunks=len(space.chunks),
        )
        for space in spaces
    )
    return encode_embeddings(embeddings), summaries


def _collect_payloads(
    *,
    markdown: str | bytes | None,
    html: str | bytes | None,
    json_resume: Any,
    embeddings: bytes | None,
    extra: list[Payload] | None,
) -> list[Payload]:
    out: list[Payload] = []
    if markdown is not None:
        out.append(
            Payload(
                data=markdown,
                name=DEFAULT_PAYLOAD_NAMES["markdown"],
                mime_type=PAYLOAD_MIME_TYPES["markdown"],
                relationship="Alternative",
            )
        )
    if html is not None:
        out.append(
            Payload(
                data=html,
                name=DEFAULT_PAYLOAD_NAMES["html"],
                mime_type=PAYLOAD_MIME_TYPES["html"],
                relationship="Alternative",
            )
        )
    if json_resume is not None:
        out.append(
            Payload(
                data=json.dumps(json_resume, indent=2),
                name=DEFAULT_PAYLOAD_NAMES["json"],
                mime_type=PAYLOAD_MIME_TYPES["json"],
                relationship="Alternative",
            )
        )
    if embeddings is not None:
        out.append(
            Payload(
                data=embeddings,
                name=DEFAULT_PAYLOAD_NAMES["embeddings"],
                mime_type=PAYLOAD_MIME_TYPES["embeddings"],
                relationship="Data",
            )
        )
    if extra:
        out.extend(extra)

    seen: set[str] = set()
    for p in out:
        if p.name in seen:
            raise ValueError(f"Duplicate payload name: {p.name}")
        seen.add(p.name)
    return out


def _default_primary(payloads: list[Payload]) -> str:
    md_name = DEFAULT_PAYLOAD_NAMES["markdown"]
    if any(p.name == md_name for p in payloads):
        return md_name
    html_name = DEFAULT_PAYLOAD_NAMES["html"]
    if any(p.name == html_name for p in payloads):
        return html_name
    return next((p.name for p in payloads if p.relationship == "Alternative"), payloads[0].name)


def _default_description(p: Payload) -> str:
    return {
        PAYLOAD_MIME_TYPES["markdown"]: "Markdown representation",
        PAYLOAD_MIME_TYPES["html"]: "HTML representation",
        PAYLOAD_MIME_TYPES["json"]: "JSON Resume representation",
        PAYLOAD_MIME_TYPES["embeddings"]: "Pre-computed embeddings",
    }.get(p.mime_type, p.name)


__all__ = ["pack"]
