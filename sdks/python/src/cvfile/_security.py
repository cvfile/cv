"""Detects PDF constructs forbidden by .cv spec §3.4.

Walks the catalog object graph from the trailer. Each rule maps to a stable
error code matching the JS SDK so cross-language tests share expectations.
"""

from __future__ import annotations

from pypdf import PdfReader
from pypdf.generic import (
    ArrayObject,
    DictionaryObject,
    IndirectObject,
    NameObject,
    PdfObject,
)

from cvfile._types import ValidationIssue


def scan_forbidden_constructs(reader: PdfReader) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    seen: set[int] = set()

    root = reader.trailer.get("/Root")
    if root is None:
        return issues

    _walk(_resolve(root), seen, issues)
    return _dedupe(issues)


def _walk(obj: PdfObject | None, seen: set[int], issues: list[ValidationIssue]) -> None:
    if obj is None:
        return
    obj_id = id(obj)
    if obj_id in seen:
        return
    seen.add(obj_id)

    if isinstance(obj, DictionaryObject):
        _inspect_dict(obj, issues)
        for value in obj.values():
            _walk(_resolve(value), seen, issues)
    elif isinstance(obj, ArrayObject):
        for item in obj:
            _walk(_resolve(item), seen, issues)


def _inspect_dict(d: DictionaryObject, issues: list[ValidationIssue]) -> None:
    type_name = _name_of(d.get("/Type"))
    subtype = _name_of(d.get("/S"))

    if type_name == "Action" or subtype:
        _inspect_action(d, subtype, issues)

    if type_name == "Filespec":
        _inspect_filespec(d, issues)

    if d.get("/JavaScript") is not None:
        issues.append(
            ValidationIssue(
                code="javascript-names-tree",
                level="error",
                message="Document declares /JavaScript names entries; JavaScript actions are forbidden (spec §3.4)",
            )
        )


def _inspect_action(d: DictionaryObject, subtype: str | None, issues: list[ValidationIssue]) -> None:
    if subtype == "JavaScript" or d.get("/JS") is not None:
        issues.append(
            ValidationIssue(
                code="javascript-action",
                level="error",
                message="Found /Action with subtype /JavaScript or /JS entry (spec §3.4)",
            )
        )
        return

    if subtype == "Launch":
        issues.append(
            ValidationIssue(
                code="launch-action",
                level="error",
                message="Found /Launch action; running external programs is forbidden (spec §3.4)",
            )
        )
        return

    if subtype == "ImportData":
        issues.append(
            ValidationIssue(
                code="import-data-action",
                level="error",
                message="Found /ImportData action; data import is forbidden (spec §3.4)",
            )
        )
        return

    if subtype == "SubmitForm":
        target = _filespec_target(_resolve(d.get("/F")))
        if not target or not target.lower().startswith("mailto:"):
            issues.append(
                ValidationIssue(
                    code="submit-form-external",
                    level="error",
                    message=(
                        f'/SubmitForm action targets non-mailto URI "{target}" (spec §3.4)'
                        if target
                        else "Found /SubmitForm action with no inspectable target (spec §3.4)"
                    ),
                )
            )


def _inspect_filespec(d: DictionaryObject, issues: list[ValidationIssue]) -> None:
    if d.get("/EF") is not None:
        return
    target = _filespec_target(d)
    issues.append(
        ValidationIssue(
            code="external-filespec",
            level="error",
            message=(
                f'External /Filespec "{target}" (spec §3.4)'
                if target
                else "External /Filespec with no /EF (spec §3.4)"
            ),
            payload=target,
        )
    )


def _filespec_target(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, DictionaryObject):
        for key in ("/UF", "/F"):
            entry: object = _resolve(value.get(key))
            if isinstance(entry, str):
                return entry
    if isinstance(value, ArrayObject):
        parts = [str(_resolve(item)) for item in value if _resolve(item) is not None]
        return "/".join(parts) if parts else None
    return None


def _name_of(value: object | None) -> str | None:
    if isinstance(value, NameObject):
        s = str(value)
        return s[1:] if s.startswith("/") else s
    if isinstance(value, str) and value.startswith("/"):
        return value[1:]
    return None


def _resolve(value: PdfObject | None) -> PdfObject | None:
    if value is None:
        return None
    if isinstance(value, IndirectObject):
        try:
            return value.get_object()
        except Exception:
            return None
    return value


def _dedupe(issues: list[ValidationIssue]) -> list[ValidationIssue]:
    seen: set[tuple[str, str | None, str]] = set()
    out: list[ValidationIssue] = []
    for issue in issues:
        key = (issue.code, issue.payload, issue.message)
        if key in seen:
            continue
        seen.add(key)
        out.append(issue)
    return out


__all__ = ["scan_forbidden_constructs"]
