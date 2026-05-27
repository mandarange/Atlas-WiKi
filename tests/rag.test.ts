import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki, DeterministicEmbeddingProvider, MemoryStore, RagVectorUnavailableError } from "../src/index.js";
import { GeminiEmbeddingProvider } from "../src/rag/providers/gemini.js";

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "atlas-wiki-rag-"));
  roots.push(path);
  return path;
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("RAG SDK", () => {
  it("degrades hybrid RAG to lexical plus structured metadata when embeddings are absent", async () => {
    const wiki = await AtlasWiki.open({ root: root() });
    const actor = actorFromId("alice");
    await wiki.ingestText({ title: "Remote Work Policy", text: "Remote work is allowed with manager approval.", owner: actor.id, visibility: "private" });

    const result = await wiki.ragSearch({ query: "remote work policy", actor, mode: "hybrid" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.citation.source_id).toMatch(/^source_/);
    expect(result.items[0]?.score_breakdown).toMatchObject({ lexical: 1 });
    expect(result.metadata.rag).toMatchObject({
      mode_requested: "hybrid",
      mode_used: "lexical_structured",
      degraded: true,
      fallback_reason: "embedding_provider_missing",
      embedding_provider: null,
      vector_index_status: "unavailable"
    });
    await wiki.close();
  });

  it("fails vector-only RAG loudly without provider or index", async () => {
    const wiki = await AtlasWiki.open({ store: new MemoryStore() });
    const actor = actorFromId("alice");
    await wiki.ingestText({ title: "Vector", text: "semantic only", visibility: "public" });

    await expect(wiki.ragSearch({ query: "semantic", actor, mode: "vector" })).rejects.toBeInstanceOf(RagVectorUnavailableError);
    await wiki.close();
  });

  it("indexes and searches with deterministic embeddings for tests", async () => {
    const actor = actorFromId("alice");
    const wiki = await AtlasWiki.open({ root: root(), rag: { embeddingProvider: new DeterministicEmbeddingProvider() } });
    await wiki.ingestText({ title: "Benefits", text: "Healthcare and wellness reimbursement details.", owner: actor.id, visibility: "private" });

    const index = await wiki.ragIndex({ actor });
    const result = await wiki.ragSearch({ query: "wellness reimbursement", actor, mode: "hybrid" });

    expect(index.indexed).toBe(1);
    expect(result.metadata.rag.degraded).toBe(false);
    expect(result.metadata.rag.embedding_provider).toBe("testing_deterministic");
    expect(result.items[0]?.score_breakdown.vector).toBeGreaterThan(0);
    await wiki.close();
  });

  it("persists vector embeddings across SDK restarts", async () => {
    const actor = actorFromId("alice");
    const path = root();
    const first = await AtlasWiki.open({ root: path, rag: { embeddingProvider: new DeterministicEmbeddingProvider() } });
    await first.ingestText({ title: "Restart Safe", text: "Persistent vector indexes survive process restarts.", owner: actor.id, visibility: "private" });
    expect((await first.ragIndex({ actor })).indexed).toBe(1);
    await first.close();

    const reopened = await AtlasWiki.open({ root: path, rag: { embeddingProvider: new DeterministicEmbeddingProvider() } });
    const result = await reopened.ragSearch({ query: "process restarts", actor, mode: "vector" });
    expect(result.items[0]?.citation.quote).toContain("Persistent vector indexes");
    expect(result.metadata.rag).toMatchObject({ mode_used: "vector", vector_index_status: "available", degraded: false });
    await reopened.close();
  });

  it("attaches RAG metadata to context packs", async () => {
    const wiki = await AtlasWiki.open({ root: root() });
    const actor = actorFromId("alice");
    await wiki.ingestText({ title: "Security", text: "Never expose service role keys in browser code.", owner: actor.id, visibility: "private" });

    const result = await wiki.ragContextPack({ query: "service role keys", actor, mode: "hybrid" });

    expect(result.pack.metadata?.rag).toMatchObject({ degraded: true, fallback_reason: "embedding_provider_missing" });
    await wiki.close();
  });

  it("builds Gemini embedding payloads by model without network access", async () => {
    const requests: unknown[] = [];
    const client = {
      models: {
        embedContent: async (input: unknown) => {
          requests.push(input);
          return { embedding: { values: [1, 2, 3] } };
        }
      }
    };
    const provider = new GeminiEmbeddingProvider({ apiKey: "test-key", model: "gemini-embedding-2", dimensions: 3, client });
    await provider.embedQuery("policy lookup");
    await provider.embedDocuments([{ id: "chunk_1", title: "Policy", text: "Use citations.", contentHash: "hash" }]);
    expect(requests).toHaveLength(2);
    expect(requests).toEqual([
      expect.objectContaining({ config: { outputDimensionality: 3 } }),
      expect.objectContaining({ config: { outputDimensionality: 3 } })
    ]);
  });

  it("maps gemini-embedding-001 query and document task types explicitly", async () => {
    const requests: Array<{ config?: Record<string, unknown> }> = [];
    const client = {
      models: {
        embedContent: async (input: { config?: Record<string, unknown> }) => {
          requests.push(input);
          return { embeddings: [{ values: [1, 2, 3] }] };
        }
      }
    };
    const provider = new GeminiEmbeddingProvider({ apiKey: "test-key", model: "gemini-embedding-001", dimensions: 3, client });
    await provider.embedQuery("policy lookup");
    await provider.embedDocuments([{ id: "chunk_1", title: "Policy", text: "Use citations.", contentHash: "hash" }]);
    expect(requests[0]?.config).toEqual({ taskType: "RETRIEVAL_QUERY" });
    expect(requests[1]?.config).toEqual({ taskType: "RETRIEVAL_DOCUMENT", title: "Policy" });
  });

  it("wraps Gemini dimension mismatch as a provider error", async () => {
    const client = { models: { embedContent: async () => ({ values: [1, 2] }) } };
    const provider = new GeminiEmbeddingProvider({ apiKey: "test-key", model: "gemini-embedding-2", dimensions: 3, client });
    await expect(provider.embedQuery("short vector")).rejects.toMatchObject({ code: "RAG_EMBEDDING_PROVIDER_ERROR", retryable: false });
  });
});
