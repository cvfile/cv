"""ASGI app/middleware for serving `.cv` files.

Mount under FastAPI/Starlette/Quart, or run standalone with uvicorn.

Example (FastAPI)::

    from fastapi import FastAPI
    from cvfile.server.asgi import build_cv_asgi_app

    app = FastAPI()
    cv_app = build_cv_asgi_app(root="./resumes")
    app.mount("/cv", cv_app)
"""

from __future__ import annotations

import os
import urllib.parse
from collections.abc import Awaitable, Callable

from cvfile.detect import is_cv_file
from cvfile.server._handler import ServeOptions, serve_cv_bytes

LoaderFn = Callable[[str], Awaitable[bytes | None]]
ASGIScope = dict[str, object]
ASGIReceive = Callable[[], Awaitable[dict[str, object]]]
ASGISend = Callable[[dict[str, object]], Awaitable[None]]


def build_cv_asgi_app(
    *,
    root: str | None = None,
    loader: LoaderFn | None = None,
    options: ServeOptions | None = None,
) -> Callable[[ASGIScope, ASGIReceive, ASGISend], Awaitable[None]]:
    """Returns an ASGI application that serves `.cv` resources.

    Provide either ``root`` (filesystem directory) or ``loader``
    (async function logical_path -> bytes | None) — never both.
    """
    if (root is None) == (loader is None):
        raise ValueError("provide exactly one of `root` or `loader`")
    base_root = os.path.abspath(root) if root else None
    opts = options or ServeOptions()

    async def app(scope: ASGIScope, receive: ASGIReceive, send: ASGISend) -> None:
        if scope.get("type") != "http":
            await _send_simple(send, 500, b"only http scope is supported")
            return

        method = str(scope.get("method", "")).upper()
        if method not in ("GET", "HEAD"):
            await _send_simple(send, 405, b"method not allowed")
            return

        path = str(scope.get("path", "/"))
        query_string = scope.get("query_string", b"") or b""
        if isinstance(query_string, bytes):
            query = urllib.parse.parse_qs(query_string.decode("latin1"))
        else:
            query = urllib.parse.parse_qs(str(query_string))
        format_query = query.get("format", [None])[0]

        accept = _header(scope, "accept")
        accept_language = _header(scope, "accept-language")

        cv_bytes = await _load(path, base_root=base_root, loader=loader)
        if cv_bytes is None:
            await _send_simple(send, 404, b"Not found")
            return
        if not is_cv_file(cv_bytes):
            await _send_simple(send, 415, b"Not a .cv file")
            return

        logical_name = path.rsplit("/", 1)[-1] or "document"
        response = serve_cv_bytes(
            cv_bytes,
            accept=accept,
            accept_language=accept_language,
            format_query=format_query,
            self_url=path,
            logical_name=logical_name,
            options=opts,
        )

        await send(
            {
                "type": "http.response.start",
                "status": response.status,
                "headers": [
                    (k.lower().encode("latin1"), v.encode("latin1"))
                    for k, v in response.headers.items()
                ],
            }
        )
        body = b"" if method == "HEAD" else response.body
        await send({"type": "http.response.body", "body": body, "more_body": False})

    return app


def _header(scope: ASGIScope, name: str) -> str | None:
    headers = scope.get("headers") or []
    target = name.lower().encode("latin1")
    for raw_key, raw_val in headers:  # type: ignore[union-attr]
        if raw_key == target:
            return raw_val.decode("latin1")
    return None


async def _load(
    path: str,
    *,
    base_root: str | None,
    loader: LoaderFn | None,
) -> bytes | None:
    if loader is not None:
        return await loader(path)
    if base_root is None:
        return None
    return _read_safe(base_root, path)


def _read_safe(base_root: str, logical: str) -> bytes | None:
    safe = os.path.normpath(logical).lstrip("/").lstrip("\\")
    full = os.path.abspath(os.path.join(base_root, safe))
    if not (full == base_root or full.startswith(base_root + os.sep)):
        return None
    try:
        if not os.path.isfile(full):
            return None
        with open(full, "rb") as f:
            return f.read()
    except OSError:
        return None


async def _send_simple(send: ASGISend, status: int, body: bytes) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"text/plain; charset=utf-8")],
        }
    )
    await send({"type": "http.response.body", "body": body, "more_body": False})
