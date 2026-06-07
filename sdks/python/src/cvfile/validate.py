"""validate(): basic structural and integrity checks on a .cv file."""

from __future__ import annotations

import hashlib
import io
import re
from typing import Literal

from pypdf import PdfReader
from pypdf.errors import PdfReadError
from pypdf.generic import IndirectObject

from cvfile._pdf import read_associated_files, read_metadata_xml
from cvfile._pdfa import check_pdfa_conformance
from cvfile._security import scan_forbidden_constructs
from cvfile._types import PdfaConformance, ValidationIssue, ValidationReport
from cvfile._xmp import parse_xmp

DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024

ValidationLevel = Literal["cv-strict", "cv-lenient"]

# Highest cv format MAJOR this SDK understands. The 0.x pre-stable line and the
# 1.x stable line share the same field set, so both validate without a warning;
# a major >= 2 is "newer" and triggers the spec §8.3 forward-compat warning.
_KNOWN_MAJOR = 1


def validate(
    data: bytes,
    *,
    strict: bool = False,
    max_payload_bytes: int = DEFAULT_MAX_PAYLOAD_BYTES,
) -> ValidationReport:
    issues: list[ValidationIssue] = []
    level: ValidationLevel = "cv-strict" if strict else "cv-lenient"

    try:
        reader = PdfReader(io.BytesIO(data))
    except (PdfReadError, KeyError, ValueError) as err:
        # A fast byte pre-check lets us surface the documented encryption code
        # even when pypdf refuses to open the encrypted document at all.
        if _looks_encrypted(data):
            return _encrypted_report(level)
        issues.append(ValidationIssue(code="pdf-parse-failed", level="error", message=str(err)))
        return ValidationReport(ok=False, level=level, issues=tuple(issues))

    if _is_encrypted(reader):
        return _encrypted_report(level)

    issues.extend(scan_forbidden_constructs(reader))

    xml = read_metadata_xml(reader)
    if not xml:
        issues.append(
            ValidationIssue(code="no-xmp", level="error", message="Document catalog is missing /Metadata stream")
        )
        return ValidationReport(ok=False, level=level, issues=tuple(issues))

    meta = parse_xmp(xml)
    if not meta:
        issues.append(
            ValidationIssue(code="xmp-missing-cv", level="error", message="XMP packet missing required cv: properties")
        )
        return ValidationReport(ok=False, level=level, issues=tuple(issues))

    newer_version_issue = _check_version(meta.version)
    if newer_version_issue:
        issues.append(newer_version_issue)

    payloads = read_associated_files(reader)
    if not payloads:
        issues.append(ValidationIssue(code="no-payloads", level="error", message="No /AF Associated Files present"))

    for payload in payloads:
        if len(payload.bytes_) > max_payload_bytes:
            issues.append(
                ValidationIssue(
                    code="payload-too-large",
                    level="error",
                    message=(
                        f'Payload "{payload.name}" is {len(payload.bytes_)} bytes; '
                        f"cap is {max_payload_bytes} (spec §7.3)"
                    ),
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
        match = next((p for p in payloads if p.name == entry.payload), None)
        if not match:
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
            actual = hashlib.sha256(match.bytes_).hexdigest()
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

    # cv-strict is defined by PDF/A-3u conformance, so it MUST be checked rather
    # than asserted: the old code appended a "not-checked" warning and still
    # returned ok under strict, certifying a property it never verified. Under
    # cv-lenient the check is skipped entirely and conformance stays "not-checked"
    # (parity with the JS SDK, which omits the field under lenient).
    conformance: PdfaConformance = "not-checked"
    if strict:
        conformance, pdfa_issues = check_pdfa_conformance(reader, xml)
        issues.extend(pdfa_issues)

    ok = all(i.level != "error" for i in issues)
    return ValidationReport(ok=ok, level=level, issues=tuple(issues), conformance=conformance)


_ENCRYPT_RE = re.compile(rb"/Encrypt\b")


def _encrypted_report(level: ValidationLevel) -> ValidationReport:
    issue = ValidationIssue(
        code="encrypted-document",
        level="error",
        message="Trailer declares /Encrypt; encryption is forbidden in cv 0.x (spec §3.4)",
    )
    return ValidationReport(ok=False, level=level, issues=(issue,))


def _is_encrypted(reader: PdfReader) -> bool:
    """Authoritative encryption check on a successfully parsed reader: pypdf's
    own flag plus the trailer /Encrypt entry, regardless of where it appears.
    """
    if reader.is_encrypted:
        return True
    encrypt = reader.trailer.get("/Encrypt")
    if isinstance(encrypt, IndirectObject):
        encrypt = encrypt.get_object()
    return encrypt is not None


def _looks_encrypted(data: bytes) -> bool:
    """Fast byte-level pre-check used only when pypdf refuses to open the file,
    so we can still surface the documented encryption code. Never the sole gate.
    """
    return bool(_ENCRYPT_RE.search(data))


def _check_version(version: str) -> ValidationIssue | None:
    """Warn when the file's MAJOR exceeds the highest major this SDK knows
    (spec §8.3 cross-major behaviour)."""
    major_str = version.split(".", 1)[0]
    try:
        major = int(major_str)
    except ValueError:
        return None
    if major <= _KNOWN_MAJOR:
        return None
    return ValidationIssue(
        code="newer-format-version",
        level="warning",
        message=(
            f"cv:version {version!r} declares major {major}, newer than this SDK "
            f"(knows up to {_KNOWN_MAJOR}.x); rendering may be incomplete (spec §8.3)"
        ),
    )


__all__ = ["DEFAULT_MAX_PAYLOAD_BYTES", "validate"]
