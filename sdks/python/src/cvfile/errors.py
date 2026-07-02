"""Typed exceptions raised by the cvfile SDK."""

from __future__ import annotations


class PayloadTooLargeError(ValueError):
    """An embedded payload exceeds the configured size cap (spec §7.3).

    Subclasses ``ValueError`` so existing call sites that treat any parse
    failure from ``extract()`` as a ``ValueError`` keep working.
    """

    def __init__(self, payload: str, size: int, max_payload_bytes: int) -> None:
        super().__init__(
            f'Payload "{payload}" is {size} bytes; cap is {max_payload_bytes} (spec §7.3). '
            "Pass a higher max_payload_bytes (or None to disable the cap) for trusted files."
        )
        self.payload = payload
        self.size = size
        self.max_payload_bytes = max_payload_bytes


__all__ = ["PayloadTooLargeError"]
