# langchain-cvfile

LangChain document loader for the [`.cv`](https://cvfile.org) open file format.

A `.cv` file is a PDF/A-3u file carrying a Markdown copy of the same content
(plus optional HTML and JSON Resume) as PDF Associated Files. Instead of OCR
ing the PDF, this loader pulls the embedded text payloads directly.

## Install

```bash
pip install langchain-cvfile
```

## Use

```python
from langchain_cvfile import CVFileLoader

loader = CVFileLoader("resume.cv")
docs = loader.load()

for doc in docs:
    print(doc.metadata["payload"], doc.metadata["mime_type"], len(doc.page_content))
```

You get one `Document` per textual payload found in the file. The Markdown
copy (typically `resume.md`) is the one flagged with `metadata["primary"] = True`.

## Metadata fields

| Key | Description |
|---|---|
| `source` | The file path you passed to the loader |
| `payload` | Name of the embedded file (e.g. `resume.md`) |
| `mime_type` | MIME of the payload (`text/markdown`, `text/html`, `application/json`) |
| `relationship` | PDF Associated Files relationship (`Alternative` for primary alternates) |
| `language` | BCP 47 language tag for this payload |
| `primary` | `True` for the payload declared as primary in the file's XMP metadata |
| `cv_version` | Version of the `.cv` spec the file conforms to |
| `cv_generator` | Tool that produced the file, if recorded |

## License

Apache-2.0.
