# @cvfile/mcp

MCP server for the [.cv open resume format](https://cvfile.org). It lets AI agents (Claude, Cursor, any MCP client) work with .cv files on the local machine: list them, validate them against the spec, read their payloads, pack new ones, and run semantic search across a folder of resumes.

There is no database and no service: every .cv file carries its own precomputed embedding vectors, so any directory of .cv files is already a searchable corpus. The server embeds the query, ranks the chunks stored inside each file, and returns the best matches with their source file.

## Setup

Claude Code:

```sh
claude mcp add cvfile -- npx -y @cvfile/mcp
```

Claude Desktop, Cursor, or any MCP client (stdio):

```json
{
  "mcpServers": {
    "cvfile": {
      "command": "npx",
      "args": ["-y", "@cvfile/mcp"]
    }
  }
}
```

## Tools

| Tool | What it does |
| --- | --- |
| `list_cvs` | Find .cv files in a directory and return their metadata (spec version, language, generator, payloads, embedding models). |
| `validate_cv` | Spec conformance report for one file; `strict` runs the full PDF/A-3u profile. |
| `read_cv` | Extract a payload: `markdown` (default), `json` (JSON Resume), `html`, or `metadata`. |
| `search_cvs` | Semantic search across all .cv files in a directory, ranked by the vectors stored inside each file. |
| `pack_cv` | Build a .cv from a rendered PDF plus markdown (and optional JSON Resume, HTML, embeddings). |

Example prompts once connected:

> Which of the resumes in ~/hiring/applications have experience with payments infrastructure?

> Validate ~/Desktop/jane-doe.cv strictly and summarize any issues.

## Query embedding backend

`search_cvs` needs one embedding call for the query itself (the resumes' vectors are already inside the files). The server auto-detects the embedding model used by the corpus and resolves a backend for it:

1. If `HF_TOKEN` (or `HUGGINGFACE_TOKEN`) is set, the hosted Hugging Face inference API is used: no downloads, fastest start.
2. Otherwise the model runs locally via `@huggingface/transformers`; the first query downloads the model (BGE-M3 is around 1 GB) and subsequent queries are instant.

Set `CVFILE_MCP_MODEL` to force a specific model instead of auto-detection.

## Library use

The server is also exported as a library, and the pieces are usable directly:

```ts
import { createCvMcpServer, searchDirectory, listCvFiles } from '@cvfile/mcp';
```

`createCvMcpServer({ backend })` accepts a custom embedding backend (any `EmbeddingBackend` from `@cvfile/embed`), which is also how the test suite runs fully offline.

## License

Apache-2.0. The .cv specification itself is CC BY 4.0; see https://cvfile.org/spec.
