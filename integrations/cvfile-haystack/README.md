# cvfile-haystack

Haystack 2.x converter component for the [`.cv`](https://cvfile.org) open file format.

A `.cv` file is a PDF/A-3u file carrying a Markdown copy of the same content
(plus optional HTML and JSON Resume) as PDF Associated Files. Instead of OCR
ing the PDF, this component reads the embedded text payloads directly and
emits Haystack `Document` objects ready for indexing.

## Install

```bash
pip install cvfile-haystack
```

## Use

```python
from haystack_integrations.components.converters.cvfile import CVFileToDocument

converter = CVFileToDocument()
result = converter.run(sources=["resume.cv"])
documents = result["documents"]

for doc in documents:
    print(doc.meta["payload"], doc.meta["mime_type"], len(doc.content))
```

You get one `Document` per textual payload found in the file. The Markdown
copy (typically `resume.md`) is the one flagged with `meta["primary"] = True`.

### Primary only

If you only want the canonical Markdown copy and want to skip language
alternates and supplements:

```python
converter = CVFileToDocument(primary_only=True)
```

### Untrusted files

By default the converter runs `cvfile.validate()` on every source before
extracting anything. Files carrying forbidden active content (JavaScript,
launch or submit actions, external references), encryption, integrity digest
mismatches, or payloads over the spec size cap make `run()` raise
`ValueError` listing the issue codes. Resumes are classic untrusted input,
so keep the default when converting files you did not produce yourself.

```python
converter = CVFileToDocument()              # verify=True (default)
converter = CVFileToDocument(verify=False)  # trusted files only
```

### Pipeline use

```python
from haystack import Pipeline
from haystack.components.embedders import SentenceTransformersDocumentEmbedder
from haystack.components.writers import DocumentWriter
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack_integrations.components.converters.cvfile import CVFileToDocument

store = InMemoryDocumentStore()
pipe = Pipeline()
pipe.add_component("read", CVFileToDocument(primary_only=True))
pipe.add_component("embed", SentenceTransformersDocumentEmbedder(model="BAAI/bge-m3"))
pipe.add_component("write", DocumentWriter(document_store=store))
pipe.connect("read.documents", "embed.documents")
pipe.connect("embed.documents", "write.documents")

pipe.run({"read": {"sources": ["resumes/jane.cv", "resumes/john.cv"]}})
```

## Metadata fields

| Key | Description |
|---|---|
| `source` | The file path (or stream name) the document came from |
| `payload` | Name of the embedded file (e.g. `resume.md`) |
| `mime_type` | MIME of the payload (`text/markdown`, `text/html`, `application/json`) |
| `relationship` | PDF Associated Files relationship (`Alternative` for primary alternates) |
| `language` | BCP 47 language tag for this payload |
| `primary` | `True` for the payload declared as primary in the file's XMP metadata |
| `cv_version` | Version of the `.cv` spec the file conforms to |
| `cv_generator` | Tool that produced the file, if recorded |

## License

Apache-2.0.
