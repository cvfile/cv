"""is_cv_file(): cheap probe for whether bytes look like a .cv file."""

from __future__ import annotations

import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from cvfile._constants import CV_NAMESPACE_URI
from cvfile._pdf import read_metadata_xml


def is_cv_file(data: bytes) -> bool:
    if len(data) < 4 or data[:4] != b"%PDF":
        return False
    try:
        reader = PdfReader(io.BytesIO(data))
        xml = read_metadata_xml(reader)
        return xml is not None and CV_NAMESPACE_URI in xml
    except (PdfReadError, ValueError, KeyError):
        return False


__all__ = ["is_cv_file"]
