"""Section-based markdown chunker — Python port of @cvfile/embed.

UTF-8 byte-offset semantics match the JS chunker so a chunk emitted by one
SDK and decoded by the other indexes back into the same source bytes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

ChunkingMode = Literal["document", "section", "paragraph"]

_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


@dataclass(frozen=True, slots=True)
class MarkdownChunk:
    id: str
    text_offset: int
    text_length: int
    text: str


def chunk_markdown(markdown: str, *, mode: ChunkingMode = "section") -> list[MarkdownChunk]:
    if mode == "document":
        return [MarkdownChunk(id="document", text_offset=0, text_length=len(markdown), text=markdown)]
    if mode == "paragraph":
        return _paragraph_chunks(markdown)
    return _section_chunks(markdown)


def _section_chunks(markdown: str) -> list[MarkdownChunk]:
    sections: list[MarkdownChunk] = []
    ids: set[str] = set()
    current_id: str | None = None
    current_start = 0
    cursor = 0

    def flush(end: int) -> None:
        nonlocal current_id, current_start
        if current_id is None:
            return
        text = markdown[current_start:end]
        if text.strip():
            sections.append(
                MarkdownChunk(
                    id=current_id,
                    text_offset=current_start,
                    text_length=end - current_start,
                    text=text,
                )
            )
        current_id = None

    for line in _split_with_offsets(markdown):
        match = _HEADING.match(line.text)
        if match:
            flush(line.offset)
            base = _slugify(match.group(2) or f"section-{len(sections) + 1}")
            current_id = _unique_id(base, ids)
            ids.add(current_id)
            current_start = line.offset
        elif current_id is None:
            current_id = _unique_id("preamble", ids)
            ids.add(current_id)
            current_start = line.offset
        cursor = line.offset + len(line.text)
    flush(cursor)

    if not sections:
        return [MarkdownChunk(id="document", text_offset=0, text_length=len(markdown), text=markdown)]
    return sections


def _paragraph_chunks(markdown: str) -> list[MarkdownChunk]:
    out: list[MarkdownChunk] = []
    ids: set[str] = set()
    cursor = 0
    n = 0
    while cursor < len(markdown):
        end = markdown.find("\n\n", cursor)
        if end == -1:
            end = len(markdown)
        text = markdown[cursor:end]
        if text.strip():
            base = _slugify(text.split("\n", 1)[0] or f"p-{n}")
            chunk_id = _unique_id(base, ids)
            ids.add(chunk_id)
            out.append(MarkdownChunk(id=chunk_id, text_offset=cursor, text_length=len(text), text=text))
            n += 1
        cursor = end + 2
    if not out:
        return [MarkdownChunk(id="document", text_offset=0, text_length=len(markdown), text=markdown)]
    return out


@dataclass(frozen=True, slots=True)
class _Line:
    text: str
    offset: int


def _split_with_offsets(s: str) -> list[_Line]:
    out: list[_Line] = []
    offset = 0
    parts = s.split("\n")
    for i, part in enumerate(parts):
        with_nl = part + ("\n" if i < len(parts) - 1 else "")
        out.append(_Line(text=with_nl, offset=offset))
        offset += len(with_nl)
    return out


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(s: str) -> str:
    base = _SLUG_RE.sub("-", s.lower()).strip("-")[:64]
    return base or "section"


def _unique_id(base: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"
