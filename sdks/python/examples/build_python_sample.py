"""Build a Python-produced .cv fixture for cross-SDK interop testing.

Outputs to packages/sdk-js/tests/fixtures/python-produced.cv so the JS test
suite can verify it extracts identically.
"""

from __future__ import annotations

import io
from pathlib import Path

import pypdf

from cvfile import extract, inspect, pack, validate


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

    cv = pack(
        pdf=make_blank_pdf(),
        markdown=SAMPLE_MD,
        html=SAMPLE_HTML,
        json_resume={"basics": {"name": "Marie Curie"}},
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
