"""Framework-agnostic core: bytes in, bytes + headers out.

ASGI/WSGI adapters wrap this. Mirrors @cvfile/server's serve.ts +
handler.ts so a request flowing through Python returns the same body
and headers Node would return for the same Accept.
"""

from __future__ import annotations

import html as _html
import sys
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, NoReturn

if sys.version_info >= (3, 11):
    from typing import assert_never
else:  # assert_never landed in typing only in Python 3.11; we support 3.10+.

    def assert_never(value: object, /) -> NoReturn:
        raise AssertionError(f"Unhandled value: {value!r}")

from cvfile.extract import extract
from cvfile.server._conneg import (
    PDF_PRIMARY_MIME,
    NegotiationResult,
    ServeFormat,
    build_link_header,
    negotiate,
)

if TYPE_CHECKING:
    from cvfile._types import CvFile, ExtractedPayload

CACHE_CONTROL_DEFAULT = "public, max-age=300"


@dataclass(frozen=True, slots=True)
class ServeOptions:
    cache_control: str = CACHE_CONTROL_DEFAULT
    default_format: str | None = None


@dataclass(frozen=True, slots=True)
class ServeBody:
    format: ServeFormat
    content_type: str
    body: bytes
    language: str | None = None


@dataclass(frozen=True, slots=True)
class ServeResponse:
    status: int
    body: bytes
    headers: dict[str, str] = field(default_factory=dict)


def serve_cv_bytes(
    cv_bytes: bytes,
    *,
    accept: str | None = None,
    accept_language: str | None = None,
    format_query: str | None = None,
    self_url: str = "/",
    logical_name: str = "document",
    options: ServeOptions | None = None,
) -> ServeResponse:
    """Negotiate, extract, and return a fully-formed HTTP response for a `.cv`."""
    opts = options or ServeOptions()
    decision = negotiate(
        accept=accept,
        accept_language=accept_language,
        format_query=format_query or opts.default_format,
    )

    body = _serve(cv_bytes, decision)
    headers: dict[str, str] = {
        "Content-Type": body.content_type,
        "Content-Length": str(len(body.body)),
        "Vary": "Accept, Accept-Language",
        "Link": build_link_header(self_url, cv_mime=PDF_PRIMARY_MIME),
        "Cache-Control": opts.cache_control,
        "Content-Disposition": f'inline; filename="{_filename_for(logical_name, body.format)}"',
    }
    if body.language:
        headers["Content-Language"] = body.language

    return ServeResponse(status=200, body=body.body, headers=headers)


def _serve(cv_bytes: bytes, decision: NegotiationResult) -> ServeBody:
    if decision.format == "pdf":
        return ServeBody(
            format="pdf",
            content_type=PDF_PRIMARY_MIME,
            body=cv_bytes,
            language=decision.language,
        )

    file = extract(cv_bytes)
    prefer_lang = decision.language or file.metadata.primary_language

    if decision.format == "markdown":
        md = _pick(file, "text/markdown", prefer_lang)
        if md is not None:
            lang = md.language or prefer_lang
            return ServeBody(
                format="markdown",
                content_type=f"text/markdown; charset=utf-8; cv-language={lang}",
                body=md.bytes_,
                language=md.language,
            )
        return _fallback_pdf(cv_bytes)

    if decision.format == "html":
        html = _pick(file, "text/html", prefer_lang)
        if html is not None:
            lang = html.language or prefer_lang
            return ServeBody(
                format="html",
                content_type=f"text/html; charset=utf-8; cv-language={lang}",
                body=html.bytes_,
                language=html.language,
            )
        md = _pick(file, "text/markdown", prefer_lang)
        if md is not None:
            rendered = _render_markdown_as_html(md.bytes_.decode("utf-8", errors="replace"), file)
            return ServeBody(
                format="html",
                content_type="text/html; charset=utf-8",
                body=rendered.encode("utf-8"),
                language=md.language,
            )
        return _fallback_pdf(cv_bytes)

    assert_never(decision.format)


def _pick(file: CvFile, mime: str, prefer_lang: str) -> ExtractedPayload | None:
    matches = [p for p in file.payloads if p.mime_type == mime]
    if not matches:
        return None
    for p in matches:
        if p.language == prefer_lang:
            return p
    return matches[0]


def _fallback_pdf(cv_bytes: bytes) -> ServeBody:
    return ServeBody(format="pdf", content_type=PDF_PRIMARY_MIME, body=cv_bytes)


def _filename_for(logical: str, fmt: ServeFormat) -> str:
    base = logical.rsplit("/", 1)[-1] or "document"
    stem = base
    for suffix in (".cv", ".pdf", ".md", ".html"):
        if stem.lower().endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    if not stem:
        stem = "document"
    if fmt == "markdown":
        return f"{stem}.md"
    if fmt == "html":
        return f"{stem}.html"
    return f"{stem}.cv"


def _render_markdown_as_html(md: str, file: CvFile) -> str:
    safe = _html.escape(md)
    lang = file.metadata.primary_language
    title = _html.escape(file.metadata.primary_payload)
    return (
        "<!doctype html>\n"
        f'<html lang="{lang}">\n'
        "<head>\n"
        '<meta charset="utf-8">\n'
        f"<title>{title}</title>\n"
        "</head>\n"
        "<body>\n"
        f"<pre>{safe}</pre>\n"
        "</body>\n"
        "</html>"
    )
