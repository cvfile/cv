"""cvfile.embed tests: chunker (always), CBOR round-trip with synthetic
vectors (always), live BGE-M3 search (skipped when HF_TOKEN missing).
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from cvfile.embed import (
    EmbeddingChunk,
    EmbeddingSpace,
    EmbeddingsPayload,
    HuggingFaceBackend,
    chunk_markdown,
    decode_embeddings,
    embed,
    encode_embeddings,
    search_semantic,
)
from cvfile.embed._embed import EmbedOptions

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = REPO_ROOT / "packages" / "embed-js" / "examples" / "out" / "jane-doe-with-bge-m3.cv"

SAMPLE = """# Jane Doe

Senior engineer.

## Experience

- ACME Corp 2022 to 2026
- Initech 2018 to 2022

## Skills

TypeScript, Go, Python.
"""


def test_chunk_markdown_section_mode() -> None:
    chunks = chunk_markdown(SAMPLE)
    assert [c.id for c in chunks] == ["jane-doe", "experience", "skills"]
    for c in chunks:
        assert SAMPLE[c.text_offset : c.text_offset + c.text_length] == c.text


MULTIBYTE_SAMPLE = """# Café résumé 📄

Développeur sénior. Æther.

## Expérience 日本語

- Œuvre 2022 à 2026 🚀
- Naïve Inc 2018 à 2022

## Compétences

Python, Go, 中文.
"""


def test_chunk_markdown_offsets_are_utf8_bytes() -> None:
    """Offsets/lengths index into the UTF-8 byte stream, not code points."""
    data = MULTIBYTE_SAMPLE.encode("utf-8")
    # Sanity: the source genuinely has multibyte chars, so byte len > char len.
    assert len(data) > len(MULTIBYTE_SAMPLE)

    chunks = chunk_markdown(MULTIBYTE_SAMPLE)
    # slugify keeps only [a-z0-9]; accents are dropped (no transliteration).
    assert [c.id for c in chunks] == ["caf-r-sum", "exp-rience", "comp-tences"]
    for c in chunks:
        sliced = data[c.text_offset : c.text_offset + c.text_length].decode("utf-8")
        assert sliced == c.text
        # A naive code-point slice would NOT round-trip here.
    # At least one chunk must start past a multibyte char to prove byte semantics.
    assert any(c.text_offset > 0 for c in chunks)


def test_chunk_markdown_paragraph_offsets_are_utf8_bytes() -> None:
    data = MULTIBYTE_SAMPLE.encode("utf-8")
    chunks = chunk_markdown(MULTIBYTE_SAMPLE, mode="paragraph")
    assert len(chunks) > 1
    for c in chunks:
        assert data[c.text_offset : c.text_offset + c.text_length].decode("utf-8") == c.text


def test_chunk_markdown_document_mode() -> None:
    chunks = chunk_markdown(SAMPLE, mode="document")
    assert len(chunks) == 1
    assert chunks[0].text == SAMPLE


def test_chunk_markdown_paragraph_mode() -> None:
    chunks = chunk_markdown(SAMPLE, mode="paragraph")
    assert len(chunks) > 1
    for c in chunks:
        assert c.text.strip()


def test_embeddings_cbor_round_trip() -> None:
    space = EmbeddingSpace(
        model="dummy/test",
        model_revision="abc123",
        dimension=4,
        metric="cosine",
        normalized=True,
        chunking="section",
        chunks=(
            EmbeddingChunk(id="header", text_offset=0, text_length=5, vector=(0.1, 0.2, 0.3, 0.4)),
            EmbeddingChunk(id="body", text_offset=6, text_length=3, vector=(-0.5, 0.0, 0.5, 1.0)),
        ),
    )
    payload = EmbeddingsPayload(format_version=1, spaces=(space,))
    encoded = encode_embeddings(payload)
    decoded = decode_embeddings(encoded)
    assert len(decoded.spaces) == 1
    s = decoded.spaces[0]
    assert s.model == "dummy/test"
    assert s.dimension == 4
    assert len(s.chunks) == 2
    for orig, got in zip(space.chunks, s.chunks, strict=True):
        assert got.id == orig.id
        assert got.text_offset == orig.text_offset
        for a, b in zip(orig.vector, got.vector, strict=True):
            assert abs(a - b) < 1e-6


def test_python_decodes_js_embeddings_fixture() -> None:
    """The .cv built by the JS SDK with real BGE-M3 vectors must decode in Python."""
    if not FIXTURE.exists():
        pytest.skip(
            "build fixture first: HF_TOKEN=... npx tsx packages/embed-js/examples/build-with-real-embeddings.ts"
        )
    from cvfile import extract

    file = extract(FIXTURE.read_bytes())
    cbor_payload = next((p for p in file.payloads if p.name == "embeddings.cbor"), None)
    assert cbor_payload is not None, "fixture has no embeddings.cbor payload"
    payload = decode_embeddings(cbor_payload.bytes_)
    assert len(payload.spaces) == 1
    space = payload.spaces[0]
    assert space.model == "BAAI/bge-m3"
    assert space.dimension == 1024
    assert len(space.chunks) >= 4
    for c in space.chunks:
        assert len(c.vector) == 1024


@pytest.mark.skipif(
    not os.environ.get("HF_TOKEN") and not os.environ.get("HUGGINGFACE_TOKEN"),
    reason="HF_TOKEN not set",
)
def test_live_bge_m3_directional_search() -> None:
    backend = HuggingFaceBackend(model="BAAI/bge-m3", dimension=1024)
    payload = embed(SAMPLE, EmbedOptions(backend=backend))
    space = payload.spaces[0]
    assert space.dimension == 1024

    encoded = encode_embeddings(payload)
    decoded = decode_embeddings(encoded)
    assert len(decoded.spaces[0].chunks) == len(space.chunks)

    cases = [
        ("python typescript programming languages", "skills", "experience"),
        ("companies and previous employers", "experience", "skills"),
    ]
    for query, expected_top, contrast in cases:
        vectors, _ = backend.embed([query])
        hits = search_semantic(decoded, vectors[0], k=len(space.chunks))
        scores = {h.chunk_id: h.score for h in hits}
        assert scores[expected_top] > scores[contrast], (
            f"query {query!r}: expected {expected_top} > {contrast}, got {scores}"
        )
