# cvfile-cv-detector (Python)

```bash
pip install cvfile-cv-detector
```

```python
from cvfile_cv_detector import detect, unwrap

with open("resume.pdf", "rb") as f:
    data = f.read()

det = detect(data)
if det.is_cv_file:
    payload = unwrap(data)
    if payload:
        markdown = payload.bytes_.decode("utf-8")
        print(f"got {payload.name} ({payload.mime_type}, {len(markdown)} chars)")
```

`detect()` is zero-dependency (pure regex over the PDF bytes). `unwrap()`
uses `pypdf` to read the PDF Associated Files (`/AF`) array.

See `../README.md` for the cross-language story and rationale.
