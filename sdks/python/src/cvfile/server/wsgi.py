"""WSGI app for serving `.cv` files (Flask, Django, Pyramid, plain WSGI).

Example (Flask)::

    from flask import Flask
    from cvfile.server.wsgi import build_cv_wsgi_app

    flask_app = Flask(__name__)
    cv_app = build_cv_wsgi_app(root="./resumes")

    @flask_app.route("/cv/<path:name>")
    def serve_cv(name):
        return cv_app  # mount via DispatcherMiddleware in production

Or use directly with any WSGI server::

    from wsgiref.simple_server import make_server
    app = build_cv_wsgi_app(root="./resumes")
    make_server("0.0.0.0", 7373, app).serve_forever()
"""

from __future__ import annotations

import os
import urllib.parse
from collections.abc import Callable, Iterable

from cvfile.detect import is_cv_file
from cvfile.server._handler import ServeOptions, serve_cv_bytes

LoaderFn = Callable[[str], "bytes | None"]
WSGIEnviron = dict[str, object]
StartResponse = Callable[[str, list[tuple[str, str]]], Callable[[bytes], None]]


def build_cv_wsgi_app(
    *,
    root: str | None = None,
    loader: LoaderFn | None = None,
    options: ServeOptions | None = None,
) -> Callable[[WSGIEnviron, StartResponse], Iterable[bytes]]:
    """Return a WSGI app that serves `.cv` resources."""
    if (root is None) == (loader is None):
        raise ValueError("provide exactly one of `root` or `loader`")
    base_root = os.path.abspath(root) if root else None
    opts = options or ServeOptions()

    def app(environ: WSGIEnviron, start_response: StartResponse) -> Iterable[bytes]:
        method = str(environ.get("REQUEST_METHOD", "")).upper()
        if method not in ("GET", "HEAD"):
            start_response("405 Method Not Allowed", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"method not allowed"]

        path_info = str(environ.get("PATH_INFO", "/")) or "/"
        query_string = str(environ.get("QUERY_STRING", "") or "")
        query = urllib.parse.parse_qs(query_string)
        format_query = query.get("format", [None])[0]

        accept = _wsgi_header(environ, "HTTP_ACCEPT")
        accept_language = _wsgi_header(environ, "HTTP_ACCEPT_LANGUAGE")

        cv_bytes = _load(path_info, base_root=base_root, loader=loader)
        if cv_bytes is None:
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Not found"]
        if not is_cv_file(cv_bytes):
            start_response("415 Unsupported Media Type", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Not a .cv file"]

        logical_name = path_info.rsplit("/", 1)[-1] or "document"
        response = serve_cv_bytes(
            cv_bytes,
            accept=accept,
            accept_language=accept_language,
            format_query=format_query,
            self_url=path_info,
            logical_name=logical_name,
            options=opts,
        )

        status = f"{response.status} {_reason(response.status)}"
        start_response(status, list(response.headers.items()))
        if method == "HEAD":
            return [b""]
        return [response.body]

    return app


def _wsgi_header(environ: WSGIEnviron, key: str) -> str | None:
    value = environ.get(key)
    if isinstance(value, str) and value:
        return value
    return None


def _load(path: str, *, base_root: str | None, loader: LoaderFn | None) -> bytes | None:
    if loader is not None:
        return loader(path)
    if base_root is None:
        return None
    safe = os.path.normpath(path).lstrip("/").lstrip("\\")
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


_REASONS = {
    200: "OK",
    404: "Not Found",
    405: "Method Not Allowed",
    415: "Unsupported Media Type",
    500: "Internal Server Error",
}


def _reason(status: int) -> str:
    return _REASONS.get(status, "OK")
