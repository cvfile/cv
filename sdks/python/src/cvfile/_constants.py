"""Constants shared across the cvfile SDK."""

CV_SPEC_VERSION = "0.1"

CV_NAMESPACE_URI = "http://ns.cvfile.org/cv/1.0/"
CV_NAMESPACE_PREFIX = "cv"

DEFAULT_GENERATOR = f"cvfile-py/{CV_SPEC_VERSION}"

DEFAULT_PAYLOAD_NAMES = {
    "markdown": "resume.md",
    "html": "resume.html",
    "json": "resume.json",
    "embeddings": "embeddings.cbor",
}

PAYLOAD_MIME_TYPES = {
    "markdown": "text/markdown",
    "html": "text/html",
    "json": "application/json",
    "embeddings": "application/vnd.cv.embeddings+cbor",
    "pdf": "application/pdf",
    "cv": "application/vnd.cv+pdf",
}

MAX_PAYLOAD_BYTES_DEFAULT = 16 * 1024 * 1024
