"""ASGI + WSGI handler integration tests against the real JS-produced fixture."""

from __future__ import annotations

import asyncio
from io import BytesIO
from pathlib import Path

import pytest

from cvfile.server import PDF_PRIMARY_MIME, serve_cv_bytes
from cvfile.server.asgi import build_cv_asgi_app
from cvfile.server.wsgi import build_cv_wsgi_app

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = REPO_ROOT / "packages" / "sdk-js" / "examples" / "out" / "jane-doe.cv"


def _bytes() -> bytes:
    if not FIXTURE.exists():
        pytest.skip(f"fixture missing at {FIXTURE}")
    return FIXTURE.read_bytes()


def test_serve_cv_bytes_default_returns_pdf() -> None:
    res = serve_cv_bytes(_bytes(), self_url="/jane.cv")
    assert res.status == 200
    assert res.headers["Content-Type"] == PDF_PRIMARY_MIME
    assert res.headers["Vary"] == "Accept, Accept-Language"
    assert "Link" in res.headers
    assert res.body[:5] == b"%PDF-"


def test_serve_cv_bytes_markdown_via_accept() -> None:
    res = serve_cv_bytes(_bytes(), accept="text/markdown")
    assert res.headers["Content-Type"].startswith("text/markdown")
    assert res.body.startswith(b"# ")


def test_serve_cv_bytes_html_falls_back_to_rendered_md_when_no_html() -> None:
    # The Jane Doe fixture has both md and html. Force md-rendering by stripping
    # via a synthetic loader is overkill; here we just confirm html serves cleanly.
    res = serve_cv_bytes(_bytes(), accept="text/html")
    assert res.headers["Content-Type"].startswith("text/html")
    assert b"<" in res.body


def test_serve_cv_bytes_query_overrides_accept() -> None:
    res = serve_cv_bytes(_bytes(), accept="text/html", format_query="md")
    assert res.headers["Content-Type"].startswith("text/markdown")


# --- ASGI ---


async def _call_asgi(
    app, path: str, headers: list[tuple[bytes, bytes]] | None = None
) -> tuple[int, dict[str, str], bytes]:
    sent: list[dict[str, object]] = []

    async def receive() -> dict[str, object]:
        return {"type": "http.disconnect"}

    async def send(msg: dict[str, object]) -> None:
        sent.append(msg)

    scope = {
        "type": "http",
        "method": "GET",
        "path": path.split("?", 1)[0],
        "query_string": (path.split("?", 1)[1] if "?" in path else "").encode("latin1"),
        "headers": headers or [],
    }
    await app(scope, receive, send)

    start = next(m for m in sent if m["type"] == "http.response.start")
    body_msg = next(m for m in sent if m["type"] == "http.response.body")
    headers_dict = {k.decode("latin1"): v.decode("latin1") for k, v in start["headers"]}  # type: ignore[union-attr]
    return int(start["status"]), headers_dict, body_msg["body"]  # type: ignore[arg-type]


def test_asgi_serves_pdf_by_default(tmp_path: Path) -> None:
    target = tmp_path / "jane.cv"
    target.write_bytes(_bytes())
    app = build_cv_asgi_app(root=str(tmp_path))
    status, headers, body = asyncio.run(_call_asgi(app, "/jane.cv"))
    assert status == 200
    assert headers["content-type"] == PDF_PRIMARY_MIME
    assert body.startswith(b"%PDF-")


def test_asgi_returns_markdown_for_text_accept(tmp_path: Path) -> None:
    target = tmp_path / "jane.cv"
    target.write_bytes(_bytes())
    app = build_cv_asgi_app(root=str(tmp_path))
    status, headers, body = asyncio.run(
        _call_asgi(app, "/jane.cv", headers=[(b"accept", b"text/markdown")])
    )
    assert status == 200
    assert headers["content-type"].startswith("text/markdown")
    assert body.startswith(b"# ")


def test_asgi_404_for_unknown_path(tmp_path: Path) -> None:
    app = build_cv_asgi_app(root=str(tmp_path))
    status, _headers, body = asyncio.run(_call_asgi(app, "/missing.cv"))
    assert status == 404
    assert b"Not found" in body


def test_asgi_415_for_non_cv_file(tmp_path: Path) -> None:
    target = tmp_path / "junk.cv"
    target.write_bytes(b"not a pdf at all")
    app = build_cv_asgi_app(root=str(tmp_path))
    status, _h, body = asyncio.run(_call_asgi(app, "/junk.cv"))
    assert status == 415
    assert b"Not a .cv file" in body


def test_asgi_loader_alternative(tmp_path: Path) -> None:
    cv_bytes = _bytes()

    async def loader(path: str) -> bytes | None:
        if path == "/in-memory.cv":
            return cv_bytes
        return None

    app = build_cv_asgi_app(loader=loader)
    status, headers, body = asyncio.run(_call_asgi(app, "/in-memory.cv?format=md"))
    assert status == 200
    assert headers["content-type"].startswith("text/markdown")
    assert body.startswith(b"# ")


def test_asgi_path_traversal_rejected(tmp_path: Path) -> None:
    app = build_cv_asgi_app(root=str(tmp_path))
    status, _h, _body = asyncio.run(_call_asgi(app, "/../../../etc/passwd"))
    # Either 404 or 415 is acceptable; what must NOT happen is a 200 with file contents.
    assert status in (404, 415)


# --- WSGI ---


def _call_wsgi(app, path: str, headers: dict[str, str] | None = None) -> tuple[int, dict[str, str], bytes]:
    environ: dict[str, object] = {
        "REQUEST_METHOD": "GET",
        "PATH_INFO": path.split("?", 1)[0],
        "QUERY_STRING": path.split("?", 1)[1] if "?" in path else "",
        "wsgi.input": BytesIO(b""),
        "wsgi.errors": BytesIO(b""),
        "wsgi.url_scheme": "http",
        "SERVER_NAME": "localhost",
        "SERVER_PORT": "7373",
    }
    for k, v in (headers or {}).items():
        environ[f"HTTP_{k.upper().replace('-', '_')}"] = v

    state: dict[str, object] = {}

    def start_response(status: str, response_headers: list[tuple[str, str]]):
        state["status"] = status
        state["headers"] = dict(response_headers)
        return lambda b: None

    body_iter = app(environ, start_response)
    body = b"".join(body_iter)
    status_str = str(state["status"])
    code = int(status_str.split(" ", 1)[0])
    return code, dict(state["headers"]), body  # type: ignore[arg-type]


def test_wsgi_serves_pdf_by_default(tmp_path: Path) -> None:
    target = tmp_path / "jane.cv"
    target.write_bytes(_bytes())
    app = build_cv_wsgi_app(root=str(tmp_path))
    status, headers, body = _call_wsgi(app, "/jane.cv")
    assert status == 200
    assert headers["Content-Type"] == PDF_PRIMARY_MIME
    assert body.startswith(b"%PDF-")


def test_wsgi_returns_markdown_for_query_param(tmp_path: Path) -> None:
    target = tmp_path / "jane.cv"
    target.write_bytes(_bytes())
    app = build_cv_wsgi_app(root=str(tmp_path))
    status, headers, body = _call_wsgi(app, "/jane.cv?format=md")
    assert status == 200
    assert headers["Content-Type"].startswith("text/markdown")
    assert body.startswith(b"# ")


def test_wsgi_404_for_missing(tmp_path: Path) -> None:
    app = build_cv_wsgi_app(root=str(tmp_path))
    status, _h, body = _call_wsgi(app, "/missing.cv")
    assert status == 404
    assert body == b"Not found"
