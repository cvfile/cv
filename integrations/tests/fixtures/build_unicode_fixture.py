"""Build a non-ASCII .cv fixture so the byte-offset chunk path is covered.

The markdown mixes accented Latin, CJK and emoji so that UTF-8 byte offsets
diverge from code-point indices: a chunker that sliced on str indices would
return garbled text here, while byte-offset slicing recovers the exact source.

Run with the cvfile SDK (and its [embed] extra) on PYTHONPATH:

    python integrations/tests/fixtures/build_unicode_fixture.py
"""

from __future__ import annotations

import hashlib
import io
import struct
from pathlib import Path

import pypdf
from cvfile import extract, pack, validate
from cvfile.embed import EmbedOptions, embed

_EMBED_DIMENSION = 8

# Heading-led sections so the section chunker emits one chunk per section, and
# every section contains multibyte characters before later sections start.
UNICODE_MD = """# Élodie Gauthier · 工程師 🚀

Ingénieure logicielle à Montréal, Québec. Café ☕ et résolution de problèmes.

## Expérience 经验

* Conçu des systèmes distribués 分布式系统 à grande échelle
* Mentorat d'équipe 团队 et révisions de code 🔍

## Compétences

* Python, Rust, Go — performance et fiabilité
* Langues : français, English, 中文 🌏
"""

UNICODE_HTML = (
    '<!doctype html>\n'
    '<html lang="fr"><head><meta charset="utf-8"><title>Élodie Gauthier</title></head>\n'
    "<body><h1>Élodie Gauthier · 工程師 🚀</h1><p>Ingénieure logicielle.</p></body></html>"
)


class DeterministicBackend:
    """Offline, reproducible embedding backend (see build_python_sample.py)."""

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


def make_blank_pdf() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=300, height=400)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def main() -> None:
    out_dir = Path(__file__).resolve().parent
    out_dir.mkdir(parents=True, exist_ok=True)

    embeddings = embed(UNICODE_MD, EmbedOptions(chunking="section", backend=DeterministicBackend()))

    cv = pack(
        pdf=make_blank_pdf(),
        markdown=UNICODE_MD,
        html=UNICODE_HTML,
        embeddings=embeddings,
        metadata={"primary_language": "fr", "generator": "cvfile-integrations/unicode-fixture"},
    )

    out_path = out_dir / "unicode.cv"
    out_path.write_bytes(cv)
    print(f"Wrote {out_path} ({len(cv)} bytes)")

    file = extract(cv)
    print(f"  payloads: {[p.name for p in file.payloads]}")
    report = validate(cv)
    print(f"  validate: ok={report.ok} issues={len(report.issues)}")


if __name__ == "__main__":
    main()
