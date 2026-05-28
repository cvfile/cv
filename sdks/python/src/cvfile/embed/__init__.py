"""Optional embedding generation and search for `.cv` files.

Install via `pip install cvfile[embed]`. Default model is BAAI/bge-m3
(1024-dim, multilingual, MIT) per spec §5; pluggable to any backend.
"""

from cvfile.embed._chunk import ChunkingMode, MarkdownChunk, chunk_markdown
from cvfile.embed._embed import EmbedOptions, embed
from cvfile.embed._embeddings import (
    EmbeddingChunk,
    EmbeddingSpace,
    EmbeddingsPayload,
    decode_embeddings,
    encode_embeddings,
)
from cvfile.embed._huggingface import HuggingFaceBackend
from cvfile.embed._resolve import ResolvedChunk, resolve_embedding_chunks
from cvfile.embed._search import SearchHit, SearchOptions, search_semantic

DEFAULT_MODEL = "BAAI/bge-m3"
DEFAULT_MODEL_DIMENSION = 1024

__all__ = [
    "DEFAULT_MODEL",
    "DEFAULT_MODEL_DIMENSION",
    "ChunkingMode",
    "EmbedOptions",
    "EmbeddingChunk",
    "EmbeddingSpace",
    "EmbeddingsPayload",
    "HuggingFaceBackend",
    "MarkdownChunk",
    "ResolvedChunk",
    "SearchHit",
    "SearchOptions",
    "chunk_markdown",
    "decode_embeddings",
    "embed",
    "encode_embeddings",
    "resolve_embedding_chunks",
    "search_semantic",
]
