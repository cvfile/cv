"""Conneg unit tests — mirror the JS conneg.test.ts assertions."""

from __future__ import annotations

import pytest

from cvfile.server import (
    PDF_PRIMARY_MIME,
    build_link_header,
    negotiate,
    parse_accept,
    parse_accept_language,
)


def test_parse_accept_sorts_by_q() -> None:
    parsed = parse_accept("text/html;q=0.5, application/pdf;q=1.0, text/markdown")
    types = [p.type for p in parsed]
    assert types[0] in ("application/pdf", "text/markdown")
    assert types[-1] == "text/html"


def test_parse_accept_handles_empty() -> None:
    assert parse_accept("") == []
    assert parse_accept(None) == []


def test_parse_accept_language_filters_star() -> None:
    langs = parse_accept_language("fr-CA;q=0.9, *;q=0.1, en")
    assert "*" not in langs
    assert langs[0] == "en"


@pytest.mark.parametrize(
    ("accept", "expected"),
    [
        ("application/pdf", "pdf"),
        ("text/markdown", "markdown"),
        ("text/x-markdown", "markdown"),
        ("text/html, application/pdf", "html"),
        ("application/vnd.cv+pdf", "pdf"),
        ("*/*", "pdf"),
        ("text/*", "html"),
        (None, "pdf"),
    ],
)
def test_negotiate_by_accept(accept: str | None, expected: str) -> None:
    assert negotiate(accept=accept).format == expected


def test_negotiate_query_overrides_accept() -> None:
    assert negotiate(accept="text/html", format_query="md").format == "markdown"
    assert negotiate(accept="text/html", format_query="pdf").format == "pdf"
    assert negotiate(accept="text/html", format_query="cv").format == "pdf"


def test_negotiate_picks_first_language() -> None:
    result = negotiate(accept="text/html", accept_language="fr-CA, en;q=0.5")
    assert result.language == "fr-ca"


def test_build_link_header_advertises_three_alternates() -> None:
    header = build_link_header("/cv/jane.cv")
    assert PDF_PRIMARY_MIME in header
    assert "text/markdown" in header
    assert "text/html" in header
    assert "format=md" in header
    assert "format=html" in header


def test_build_link_header_handles_existing_query_string() -> None:
    header = build_link_header("/cv/jane.cv?v=42")
    assert "&format=md" in header
    assert "&format=html" in header
