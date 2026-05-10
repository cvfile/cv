"""validate(): basic structural and integrity checks on a .cv file."""

from __future__ import annotations

import hashlib
import io
import re

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from cvfile._pdf import read_associated_files, read_metadata_xml
from cvfile._security import scan_forbidden_constructs
from cvfile._types import ValidationIssue, ValidationReport
from cvfile._xmp import parse_xmp

DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024


def validate(
    data: bytes,
    *,
    strict: bool = False,
    max_payload_bytes: int = DEFAULT_MAX_PAYLOAD_BYTES,
) -> ValidationReport:
    issues: list[ValidationIssue] = []
    level = "cv-strict" if strict else "cv-lenient"

    if _looks_encrypted(data):
        issues.append(
            ValidationIssue(
                code="encrypted-document",
                level="error",
                message="Trailer declares /Encrypt; encryption is forbidden in cv 0.x (spec §3.4)",
            )
        )
        return ValidationReport(ok=False, level=level, issues=tuple(issues))

    try:
        reader = PdfReader(io.BytesIO(data))
    except PdfReadError as err:
        issues.append(ValidationIssue(code="pdf-parse-failed", level="error", message=str(err)))
        return ValidationReport(ok=False, level=level, issues=tuple(issues))

    issues.extend(scan_forbidden_constructs(reader))

    xml = read_metadata_xml(reader)
    if not xml:
        issues.append(ValidationIssue(code="no-xmp", level="error", message="Document catalog is missing /Metadata stream"))
        return ValidationReport(ok=False, level=level, issues=tuple(issues))

    meta = parse_xmp(xml)
    if not meta:
        issues.append(
            ValidationIssue(code="xmp-missing-cv", level="error", message="XMP packet missing required cv: properties")
        )
        return ValidationReport(ok=False, level=level, issues=tuple(issues))

    payloads = read_associated_files(reader)
    if not payloads:
        issues.append(ValidationIssue(code="no-payloads", level="error", message="No /AF Associated Files present"))

    for payload in payloads:
        if len(payload.bytes_) > max_payload_bytes:
            issues.append(
                ValidationIssue(
                    code="payload-too-large",
                    level="error",
                    message=f'Payload "{payload.name}" is {len(payload.bytes_)} bytes; cap is {max_payload_bytes} (spec §7.3)',
                    payload=payload.name,
                )
            )

    if not any(p.name == meta.primary_payload for p in payloads):
        issues.append(
            ValidationIssue(
                code="primary-missing",
                level="error",
                message=f'cv:primaryPayload "{meta.primary_payload}" not present in /AF',
            )
        )

    for entry in meta.integrity:
        payload = next((p for p in payloads if p.name == entry.payload), None)
        if not payload:
            issues.append(
                ValidationIssue(
                    code="integrity-payload-missing",
                    level="error",
                    message=f'Integrity entry references unknown payload "{entry.payload}"',
                    payload=entry.payload,
                )
            )
            continue
        if entry.algorithm in {"sha-256", "sha256"}:
            actual = hashlib.sha256(payload.bytes_).hexdigest()
            if actual != entry.digest.lower():
                issues.append(
                    ValidationIssue(
                        code="integrity-mismatch",
                        level="error",
                        message=f'Integrity digest mismatch for "{entry.payload}"',
                        payload=entry.payload,
                    )
                )
        else:
            issues.append(
                ValidationIssue(
                    code="integrity-unsupported-algo",
                    level="warning",
                    message=f'Unsupported digest algorithm "{entry.algorithm}" for "{entry.payload}"',
                    payload=entry.payload,
                )
            )

    if strict:
        issues.append(
            ValidationIssue(
                code="pdfa3-not-checked",
                level="warning",
                message="cv-strict requires veraPDF PDF/A-3u conformance, which this SDK does not run in-process",
            )
        )

    ok = all(i.level != "error" for i in issues)
    return ValidationReport(ok=ok, level=level, issues=tuple(issues))


_ENCRYPT_RE = re.compile(rb"/Encrypt\b")


def _looks_encrypted(data: bytes) -> bool:
    """Byte-level pre-check: pypdf can refuse encrypted PDFs at parse time, so
    the structural scanner never gets a chance to surface the documented code.
    """
    tail = data[-4096:] if len(data) > 4096 else data
    return bool(_ENCRYPT_RE.search(tail))


__all__ = ["validate", "DEFAULT_MAX_PAYLOAD_BYTES"]
