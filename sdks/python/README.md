# `cvfile`

Reference Python SDK for the [`.cv`](https://cvfile.org) open file format.

## Install

```bash
pip install cvfile
```

## Pack

```python
from cvfile import pack

with open("resume.pdf", "rb") as f:
    pdf_bytes = f.read()
with open("resume.md") as f:
    md = f.read()

cv_bytes = pack(
    pdf=pdf_bytes,
    markdown=md,
    metadata={"primary_language": "en"},
)

with open("resume.cv", "wb") as f:
    f.write(cv_bytes)
```

## Extract

```python
from cvfile import extract, extract_markdown

file = extract(open("resume.cv", "rb").read())
print(file.metadata.version)            # "0.1"
print([p.name for p in file.payloads])  # ['resume.md', 'resume.html']

md = extract_markdown(open("resume.cv", "rb").read())
```

## License

Apache-2.0.
