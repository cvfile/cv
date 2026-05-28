"""Content negotiation for `.cv` resources.

Mirrors @cvfile/server's conneg algorithm exactly. ?format=md|html|pdf wins
over Accept; otherwise q-sorted Accept; defaults to PDF.
"""

from __future__ import annotations

import contextlib
import re
from dataclasses import dataclass
from typing import Literal

ServeFormat = Literal["pdf", "markdown", "html"]

PDF_PRIMARY_MIME = "application/vnd.cv+pdf"
PDF_FALLBACK_MIME = "application/pdf"

_FORMAT_BY_MIME: dict[str, ServeFormat] = {
    "text/markdown": "markdown",
    "text/x-markdown": "markdown",
    "text/html": "html",
    "application/xhtml+xml": "html",
    "application/pdf": "pdf",
    "application/vnd.cv+pdf": "pdf",
}

_FORMAT_BY_QUERY: dict[str, ServeFormat] = {
    "md": "markdown",
    "markdown": "markdown",
    "html": "html",
    "pdf": "pdf",
    "cv": "pdf",
}

_Q_RE = re.compile(r"^q\s*=\s*(\d*\.?\d+)", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class NegotiationResult:
    format: ServeFormat
    language: str | None


@dataclass(frozen=True, slots=True)
class _ParsedAccept:
    type: str
    q: float


def parse_accept(header: str | None) -> list[_ParsedAccept]:
    if not header:
        return []
    parts: list[_ParsedAccept] = []
    for raw in header.split(","):
        bits = [b.strip() for b in raw.strip().split(";")]
        if not bits or not bits[0]:
            continue
        q = 1.0
        for p in bits[1:]:
            m = _Q_RE.match(p)
            if m:
                with contextlib.suppress(ValueError):
                    q = float(m.group(1))
        parts.append(_ParsedAccept(type=bits[0].lower(), q=q))
    parts.sort(key=lambda p: p.q, reverse=True)
    return parts


def parse_accept_language(header: str | None) -> list[str]:
    if not header:
        return []
    pairs: list[tuple[str, float]] = []
    for raw in header.split(","):
        bits = [b.strip() for b in raw.strip().split(";")]
        if not bits or not bits[0]:
            continue
        tag = bits[0].lower()
        if tag == "*":
            continue
        q = 1.0
        for p in bits[1:]:
            m = _Q_RE.match(p)
            if m:
                with contextlib.suppress(ValueError):
                    q = float(m.group(1))
        pairs.append((tag, q))
    pairs.sort(key=lambda p: p[1], reverse=True)
    return [tag for tag, _ in pairs]


def negotiate(
    *,
    accept: str | None = None,
    accept_language: str | None = None,
    format_query: str | None = None,
) -> NegotiationResult:
    languages = parse_accept_language(accept_language)
    language = languages[0] if languages else None

    if format_query:
        from_query = _FORMAT_BY_QUERY.get(format_query.lower())
        if from_query:
            return NegotiationResult(format=from_query, language=language)

    for entry in parse_accept(accept):
        direct = _FORMAT_BY_MIME.get(entry.type)
        if direct:
            return NegotiationResult(format=direct, language=language)
        if entry.type in ("*/*", "application/*"):
            return NegotiationResult(format="pdf", language=language)
        if entry.type == "text/*":
            return NegotiationResult(format="html", language=language)

    return NegotiationResult(format="pdf", language=language)


def build_link_header(self_url: str, *, cv_mime: str = PDF_PRIMARY_MIME) -> str:
    sep = "&" if "?" in self_url else "?"
    return ", ".join(
        [
            f'<{self_url}>; rel="alternate"; type="{cv_mime}"',
            f'<{self_url}{sep}format=md>; rel="alternate"; type="text/markdown"',
            f'<{self_url}{sep}format=html>; rel="alternate"; type="text/html"',
        ]
    )
