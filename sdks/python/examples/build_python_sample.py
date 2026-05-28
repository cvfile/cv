"""Build a Python-produced .cv fixture for cross-SDK interop testing.

Outputs to packages/sdk-js/tests/fixtures/python-produced.cv so the JS test
suite can verify it extracts identically.
"""

from __future__ import annotations

import hashlib
import io
import struct
from pathlib import Path

import pypdf

from cvfile import extract, inspect, pack, validate
from cvfile.embed import EmbedOptions, embed

_EMBED_DIMENSION = 8


class DeterministicBackend:
    """Offline, reproducible embedding backend for fixtures.

    Hashes each chunk's text into a fixed-length float32 vector so the fixture
    is byte-stable across runs and machines without any model download. Not for
    real retrieval; only to exercise the embeddings path end to end.
    """

    model = "fixture/deterministic-hash"
    model_revision = "v1"
    metric = "cosine"
    normalized = False

    def embed(self, texts: list[str]) -> tuple[list[tuple[float, ...]], int]:
        vectors: list[tuple[float, ...]] = []
        for text in texts:
            digest = hashlib.sha256(text.encode("utf-8")).digest()
            raw = (digest * ((_EMBED_DIMENSION * 4) // len(digest) + 1))[: _EMBED_DIMENSION * 4]
            vectors.append(struct.unpack(f"<{_EMBED_DIMENSION}f", raw))
        return vectors, _EMBED_DIMENSION


SAMPLE_MD = """# Marie Curie

Physicist and chemist  ·  Paris, France

## Notable

* Discovered polonium and radium
* Two Nobel Prizes (Physics 1903, Chemistry 1911)
"""

SAMPLE_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Marie Curie</title></head>
<body><h1>Marie Curie</h1><p>Physicist and chemist.</p></body></html>"""


def make_blank_pdf() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=300, height=400)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    out_dir = repo_root / "packages" / "sdk-js" / "tests" / "fixtures"
    out_dir.mkdir(parents=True, exist_ok=True)

    embeddings = embed(SAMPLE_MD, EmbedOptions(chunking="section", backend=DeterministicBackend()))

    cv = pack(
        pdf=make_blank_pdf(),
        markdown=SAMPLE_MD,
        html=SAMPLE_HTML,
        json_resume={"basics": {"name": "Marie Curie"}},
        embeddings=embeddings,
        metadata={"primary_language": "en", "generator": "cvfile-py-examples/marie-curie"},
    )

    out_path = out_dir / "python-produced.cv"
    out_path.write_bytes(cv)
    print(f"Wrote {out_path} ({len(cv)} bytes)")

    # Self-verify the fixture is sane.
    file = extract(cv)
    print(f"  payloads: {[p.name for p in file.payloads]}")
    print(f"  metadata: version={file.metadata.version} lang={file.metadata.primary_language}")

    meta = inspect(cv)
    assert meta.primary_payload == "resume.md"

    report = validate(cv)
    print(f"  validate: ok={report.ok} issues={len(report.issues)}")


if __name__ == "__main__":
    main()
