# cvfile integrations

Thin wrapper packages that expose the `cvfile` Python SDK as a first class
loader/reader inside other ecosystems.

| Package | Ecosystem | PyPI |
|---|---|---|
| [`langchain-cvfile`](./langchain-cvfile) | LangChain document loader (`CVFileLoader`) | [`pip install langchain-cvfile`](https://pypi.org/project/langchain-cvfile/) |
| [`llama-index-readers-cvfile`](./llama-index-readers-cvfile) | LlamaIndex reader (`CVFileReader`) | [`pip install llama-index-readers-cvfile`](https://pypi.org/project/llama-index-readers-cvfile/) |
| [`cvfile-haystack`](./cvfile-haystack) | Haystack 2.x converter (`CVFileToDocument`) | [`pip install cvfile-haystack`](https://pypi.org/project/cvfile-haystack/) |

Each wrapper:

* depends on the upstream `cvfile` package and adds an adapter class
  (`CVFileLoader`, `CVFileReader`, or `CVFileToDocument`) producing the
  ecosystem's native `Document` type.
* emits one `Document` per textual payload (Markdown, HTML, JSON) embedded
  in the `.cv` file via PDF Associated Files. The PDF visual layer is
  intentionally not text mined: the embedded Markdown is the canonical text
  representation of the same content.
* flags the primary payload (the one declared in the file's XMP
  `cv:primaryPayload`) with `metadata["primary"] = True` so chunkers can
  drop alternates if needed.
* on LlamaIndex, also populates `Document.embedding` from the precomputed
  `embeddings.cbor` payload when the `.cv` ships one, so retrieval pipelines
  skip the embedding pass entirely.

All three share the same release-via-trusted-publishing flow as `cvfile`
itself (see `.github/workflows/publish-langchain-cvfile.yml`,
`publish-llama-index-readers-cvfile.yml`, and
`publish-cvfile-haystack.yml`).
