import { describe, expect, it } from 'vitest';
import { decodeEmbeddings, encodeEmbeddings } from '@cvfile/sdk';
import { embed } from '../src/embed.js';
import { searchSemantic } from '../src/search.js';
import { createHuggingFaceBackend } from '../src/huggingface-backend.js';

const sample = `# Jane Doe

Senior software engineer with deep experience in distributed systems.

## Experience

Founding engineer at ACME Corp from 2022 to 2026. Led the migration to Kubernetes
and built the multi-region replication layer.

## Skills

TypeScript, Go, Python, PostgreSQL, Kafka, Redis, Kubernetes.

## Education

Master of Science in Computer Science, 2018.
`;

// Real BGE-M3 via the Hugging Face Inference API. No local model download.
// Requires HF_TOKEN in the environment. The test suite skips when the token
// is absent (CI on PRs from forks, contributors without an HF account) so
// the rest of the embed-js tests still run.
const HAS_HF_TOKEN = Boolean(process.env.HF_TOKEN ?? process.env.HUGGINGFACE_TOKEN);

describe.skipIf(!HAS_HF_TOKEN)('embed round trip with BGE-M3 (Hugging Face Inference API)', () => {
  const hfBackend = HAS_HF_TOKEN ? createHuggingFaceBackend({ model: 'BAAI/bge-m3', dimension: 1024 }) : null;

  it('embeds, encodes, decodes, and ranks the relevant section first', async () => {
    const payload = await embed(sample, { backend: hfBackend! });
    expect(payload.spaces).toHaveLength(1);
    const space = payload.spaces[0]!;
    expect(space.model).toBe('BAAI/bge-m3');
    expect(space.dimension).toBe(1024);
    expect(space.metric).toBe('cosine');
    expect(space.normalized).toBe(true);
    expect(space.chunks.length).toBeGreaterThanOrEqual(4);

    for (const chunk of space.chunks) {
      expect(chunk.vector.length).toBe(1024);
      const slice = sample.slice(chunk.textOffset, chunk.textOffset + chunk.textLength);
      expect(slice.length).toBe(chunk.textLength);
    }

    const encoded = encodeEmbeddings(payload);
    const decoded = decodeEmbeddings(encoded);
    expect(decoded.spaces).toHaveLength(1);
    expect(decoded.spaces[0]!.chunks).toHaveLength(space.chunks.length);
    const original = space.chunks[0]!.vector;
    const restored = decoded.spaces[0]!.chunks[0]!.vector;
    for (let i = 0; i < original.length; i += 1) {
      expect(restored[i]).toBeCloseTo(original[i]!, 5);
    }

    // Two directional queries: each should rank the section that matches
    // it semantically above the section that doesn't.
    const k8sQuery = await hfBackend!.embed(['kubernetes multi-region replication infrastructure']);
    const k8sHits = searchSemantic(decoded, k8sQuery.vectors[0]!, { k: space.chunks.length });
    const k8sScores = Object.fromEntries(k8sHits.map((h) => [h.chunkId, h.score]));
    expect(k8sScores.experience).toBeGreaterThan(k8sScores.education!);

    const eduQuery = await hfBackend!.embed(['masters degree academic studies']);
    const eduHits = searchSemantic(decoded, eduQuery.vectors[0]!, { k: space.chunks.length });
    const eduScores = Object.fromEntries(eduHits.map((h) => [h.chunkId, h.score]));
    expect(eduScores.education).toBeGreaterThan(eduScores.skills!);
  });
});
