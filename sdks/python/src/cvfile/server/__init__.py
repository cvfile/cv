"""HTTP server middleware for the .cv format.

Two adapters ship: ASGI (FastAPI/Starlette/native) and WSGI (Flask/Django).
Both share the same conneg algorithm as @cvfile/server in JS so a request
served by Python or Node ends up with the same representation.
"""

from cvfile.server._conneg import (
    PDF_FALLBACK_MIME,
    PDF_PRIMARY_MIME,
    NegotiationResult,
    ServeFormat,
    build_link_header,
    negotiate,
    parse_accept,
    parse_accept_language,
)
from cvfile.server._handler import serve_cv_bytes, ServeOptions

__all__ = [
    "PDF_FALLBACK_MIME",
    "PDF_PRIMARY_MIME",
    "NegotiationResult",
    "ServeFormat",
    "ServeOptions",
    "build_link_header",
    "negotiate",
    "parse_accept",
    "parse_accept_language",
    "serve_cv_bytes",
]
