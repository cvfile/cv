# llama-index-readers-cvfile

LlamaIndex reader for the [`.cv`](https://cvfile.org) open file format.

A `.cv` file is a PDF/A-3u file carrying a Markdown copy of the same content
(plus optional HTML and JSON Resume) as PDF Associated Files. Instead of OCR
ing the PDF, this reader pulls the embedded text payloads directly.

## Install

```bash
pip install llama-index-readers-cvfile
```

## Use

```python
from pathlib import Path
from llama_index.readers.cvfile import CVFileReader

reader = CVFileReader()
docs = reader.load_data(file=Path("resume.cv"))

for doc in docs:
    print(doc.metadata["payload"], doc.metadata["mime_type"], len(doc.text))
```

You get one `Document` per textual payload found in the file. The Markdown
copy (typically `resume.md`) is the one flagged with `metadata["primary"] = True`.

## Untrusted files

By default the reader runs `cvfile.validate()` before extracting anything.
Files carrying forbidden active content (JavaScript, launch or submit
actions, external references), encryption, integrity digest mismatches, or
payloads over the spec size cap raise `ValueError` listing the issue codes.
Resumes are classic untrusted input, so keep the default when loading files
you did not produce yourself.

```python
reader = CVFileReader()              # verify=True (default)
reader = CVFileReader(verify=False)  # trusted files only
```

## Metadata fields

| Key | Description |
|---|---|
| `source` | Absolute path to the loaded file |
| `file_name` | Basename of the source file |
| `payload` | Name of the embedded file (e.g. `resume.md`) |
| `mime_type` | MIME of the payload (`text/markdown`, `text/html`, `application/json`) |
| `relationship` | PDF Associated Files relationship (`Alternative` for primary alternates) |
| `language` | BCP 47 language tag for this payload |
| `primary` | `True` for the payload declared as primary in the file's XMP metadata |
| `cv_version` | Version of the `.cv` spec the file conforms to |
| `cv_generator` | Tool that produced the file, if recorded |

## License

Apache-2.0.
