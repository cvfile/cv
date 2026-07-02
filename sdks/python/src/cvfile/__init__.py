"""Reference SDK for the .cv open file format."""

from cvfile._constants import (
    CV_NAMESPACE_PREFIX,
    CV_NAMESPACE_URI,
    CV_SPEC_VERSION,
    DEFAULT_PAYLOAD_NAMES,
    PAYLOAD_MIME_TYPES,
)
from cvfile._types import (
    AlternateMeta,
    CvFile,
    CvMetadata,
    EmbeddingSpaceSummary,
    ExtractedPayload,
    IntegrityEntry,
    Payload,
    PdfaConformance,
    ValidationIssue,
    ValidationReport,
)
from cvfile.detect import is_cv_file
from cvfile.errors import PayloadTooLargeError
from cvfile.extract import extract, extract_html, extract_markdown
from cvfile.inspect import inspect
from cvfile.pack import pack
from cvfile.validate import DEFAULT_MAX_PAYLOAD_BYTES, validate

__all__ = [
    "CV_NAMESPACE_PREFIX",
    "CV_NAMESPACE_URI",
    "CV_SPEC_VERSION",
    "DEFAULT_MAX_PAYLOAD_BYTES",
    "DEFAULT_PAYLOAD_NAMES",
    "PAYLOAD_MIME_TYPES",
    "AlternateMeta",
    "CvFile",
    "CvMetadata",
    "EmbeddingSpaceSummary",
    "ExtractedPayload",
    "IntegrityEntry",
    "Payload",
    "PayloadTooLargeError",
    "PdfaConformance",
    "ValidationIssue",
    "ValidationReport",
    "extract",
    "extract_html",
    "extract_markdown",
    "inspect",
    "is_cv_file",
    "pack",
    "validate",
]
