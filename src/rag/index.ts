import { contentHash, sha256 } from "../core/hash/index.js";
import { stableId } from "../core/ids/index.js";
import type { ActorRef } from "../core/records/index.js";
import type { AtlasWikiStore, RagEmbeddingProfile, RagStoredEmbedding, SearchResult } from "../store/store-contract.js";

export type RagMode = "lexical" | "structured" | "vector" | "hybrid";
export type RagModeUsed = "lexical" | "structured" | "vector" | "hybrid" | "lexical_structured";
export type RagFallbackPolicy = "error" | "degrade" | "lexical_only" | "structured_only" | "testing_deterministic_embeddings";
export type RagFallbackReason = "embedding_provider_missing" | "vector_index_unavailable" | "vector_index_empty" | "fallback_policy" | null;

export interface RagEmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  readonly promptPolicy: string;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(documents: RagEmbeddingDocument[]): Promise<number[][]>;
}

export interface RagEmbeddingDocument {
  id: string;
  title?: string | undefined;
  text: string;
  contentHash: string;
}

export interface RagSearchOptions {
  query: string;
  actor: ActorRef;
  mode?: RagMode | undefined;
  fallbackPolicy?: RagFallbackPolicy | undefined;
  limit?: number | undefined;
}

export interface RagScoreBreakdown {
  lexical: number;
  structured: number;
  vector: number;
  freshness_penalty: number;
  authority_boost: number;
  total: number;
}

export interface RagCitation {
  id: string;
  source_id: string;
  chunk_id: string;
  title: string;
  uri?: string | undefined;
  quote: string;
}

export interface RagSearchItem {
  source_id: string;
  chunk_id: string;
  text: string;
  title: string;
  citation: RagCitation;
  score: number;
  score_breakdown: RagScoreBreakdown;
}

export interface RagMetadata {
  mode_requested: RagMode;
  mode_used: RagModeUsed;
  degraded: boolean;
  fallback_reason: RagFallbackReason;
  embedding_provider: string | null;
  embedding_model: string | null;
  embedding_prompt_policy: string | null;
  vector_index_status: "available" | "unavailable" | "empty";
  warnings: string[];
}

export interface RagSearchResponse {
  query: string;
  items: RagSearchItem[];
  metadata: { rag: RagMetadata };
}

export interface RagContextPackResponse {
  query: string;
  pack: Awaited<ReturnType<AtlasWikiStore["contextPack"]>>;
  rag: RagMetadata;
}

export interface RagStatus {
  enabled: boolean;
  embedding_provider: string | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  embedding_prompt_policy: string | null;
  vector_index_status: "available" | "unavailable" | "empty";
  indexed_chunks: number;
  stale_chunks: number;
}

export interface RagIndexResponse extends RagStatus {
  ok: boolean;
  indexed: number;
  skipped: number;
  warnings: string[];
}

export class RagVectorUnavailableError extends Error {
  readonly code = "RAG_VECTOR_UNAVAILABLE";
  constructor(message: string, readonly reason: Exclude<RagFallbackReason, null>) {
    super(message);
    this.name = "RagVectorUnavailableError";
  }
}

export class RagEmbeddingProviderError extends Error {
  readonly code = "RAG_EMBEDDING_PROVIDER_ERROR";
  readonly retryable: boolean;
  constructor(message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "RagEmbeddingProviderError";
    this.retryable = options.retryable ?? false;
  }
}

export class RagService {
  constructor(private readonly store: AtlasWikiStore, private readonly embeddingProvider?: RagEmbeddingProvider | undefined) {}

  async search(options: RagSearchOptions): Promise<RagSearchResponse> {
    const mode = options.mode ?? "hybrid";
    const fallbackPolicy = options.fallbackPolicy ?? (mode === "vector" ? "error" : "degrade");
    const limit = options.limit ?? 10;
    const vectorState = await this.vectorIndexStatus();
    if (mode === "vector" && (!this.embeddingProvider || vectorState !== "available")) {
      throw vectorUnavailable(this.embeddingProvider ? "vector_index_unavailable" : "embedding_provider_missing");
    }

    const lexicalAllowed = mode === "lexical" || mode === "hybrid" || fallbackPolicy === "lexical_only";
    const structuredAllowed = mode === "structured" || mode === "hybrid" || fallbackPolicy === "structured_only";
    const vectorAllowed = (mode === "vector" || mode === "hybrid") && this.embeddingProvider && vectorState === "available";
    const fallback = !vectorAllowed && (mode === "hybrid" || fallbackPolicy === "lexical_only" || fallbackPolicy === "structured_only");
    if (mode === "hybrid" && !vectorAllowed && fallbackPolicy === "error") {
      throw vectorUnavailable(this.embeddingProvider ? "vector_index_unavailable" : "embedding_provider_missing");
    }

    const lexical = lexicalAllowed || structuredAllowed ? await this.store.search(options.query, options.actor, limit * 2) : [];
    const byChunk = new Map<string, RagSearchItem>();
    for (const result of lexical) {
      const item = toRagItem(result, options.query);
      if (structuredAllowed) {
        const structuredBoost = structuredScore(result, options.query);
        item.score_breakdown.structured = structuredBoost;
        item.score_breakdown.authority_boost = structuredBoost > 0.4 ? 0.1 : 0;
      }
      item.score_breakdown.total = totalScore(item.score_breakdown);
      item.score = item.score_breakdown.total;
      byChunk.set(item.chunk_id, item);
    }

    if (vectorAllowed && this.embeddingProvider) {
      const profile = this.embeddingProfile();
      const queryVector = await safeEmbedQuery(this.embeddingProvider, options.query);
      assertVectorDimensions(queryVector, this.embeddingProvider.dimensions);
      for (const entry of await this.store.listRagChunkEmbeddings(profile, options.actor, limit * 4)) {
        const vectorScore = cosineSimilarity(queryVector, entry.vector);
        const baseItem = toRagItem(storedEmbeddingToSearchResult(entry), options.query);
        const existing = byChunk.get(entry.chunk_id) ?? baseItem;
        existing.score_breakdown.vector = Math.max(existing.score_breakdown.vector, vectorScore);
        existing.score_breakdown.total = totalScore(existing.score_breakdown);
        existing.score = existing.score_breakdown.total;
        byChunk.set(existing.chunk_id, existing);
      }
    }

    const modeUsed: RagModeUsed = vectorAllowed ? (mode === "vector" ? "vector" : "hybrid") : structuredAllowed && lexicalAllowed ? "lexical_structured" : structuredAllowed ? "structured" : "lexical";
    const fallbackReason: RagFallbackReason = vectorAllowed ? null : mode === "hybrid" || fallback ? (this.embeddingProvider ? vectorState === "empty" ? "vector_index_empty" : "vector_index_unavailable" : "embedding_provider_missing") : null;
    const items = [...byChunk.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    return {
      query: options.query,
      items,
      metadata: { rag: this.metadata(mode, modeUsed, Boolean(fallbackReason), fallbackReason, vectorState) }
    };
  }

  async contextPack(options: RagSearchOptions): Promise<RagContextPackResponse> {
    const response = await this.search(options);
    const pack = await this.store.contextPack(options.query, options.actor, options.limit);
    const included_refs = response.items.map((item) => ({ id: item.source_id, schema: "atlas.wiki.source.v1", kind: "source" }));
    const citations = response.items.map((item) => ({
      id: item.citation.id,
      source_ref: { id: item.source_id, schema: "atlas.wiki.source.v1", kind: "source" },
      title: item.citation.title,
      uri: item.citation.uri,
      quote: item.citation.quote
    }));
    const metadata = { ...(pack.metadata ?? {}), rag: response.metadata.rag };
    return {
      query: options.query,
      pack: {
        ...pack,
        included_refs,
        citations,
        candidate_count: response.items.length,
        authorized_count: response.items.length,
        metadata
      },
      rag: response.metadata.rag
    };
  }

  async index(options: { actor: ActorRef; query?: string | undefined; limit?: number | undefined; fallbackPolicy?: RagFallbackPolicy | undefined }): Promise<RagIndexResponse> {
    if (!this.embeddingProvider) {
      if (options.fallbackPolicy === "testing_deterministic_embeddings") throw vectorUnavailable("embedding_provider_missing");
      throw vectorUnavailable("embedding_provider_missing");
    }
    const chunks = await this.store.listRagIndexChunks(options.actor, options.limit ?? 100);
    const profile = this.embeddingProfile();
    await this.store.upsertRagEmbeddingProfile(profile);
    let indexed = 0;
    let skipped = 0;
    const warnings: string[] = [];
    for (const chunk of chunks) {
      if (!chunk.text.trim()) {
        skipped += 1;
        warnings.push(`empty_chunk:${chunk.chunk_id}`);
        continue;
      }
      const document: RagEmbeddingDocument = { id: chunk.chunk_id, title: chunk.source.title, text: chunk.text, contentHash: chunk.content_hash };
      const [vector] = await safeEmbedDocuments(this.embeddingProvider, [document]);
      if (!vector) {
        skipped += 1;
        continue;
      }
      assertVectorDimensions(vector, this.embeddingProvider.dimensions);
      await this.store.upsertRagChunkEmbedding({
        chunk_id: chunk.chunk_id,
        profile_id: profile.id,
        provider_id: profile.provider_id,
        model: profile.model,
        dimensions: profile.dimensions,
        content_hash: document.contentHash,
        vector
      });
      indexed += 1;
    }
    const stats = await this.store.ragVectorStats(profile);
    return {
      ...this.status(),
      vector_index_status: stats.indexed_chunks > 0 ? "available" : "empty",
      indexed_chunks: stats.indexed_chunks,
      stale_chunks: stats.stale_chunks,
      ok: true,
      indexed,
      skipped,
      warnings
    };
  }

  status(): RagStatus {
    const profile = this.embeddingProvider ? this.embeddingProfile() : undefined;
    const stats = profile ? this.store.ragVectorStats(profile) : { indexed_chunks: 0, stale_chunks: 0 };
    const syncStats = isPromiseLike(stats) ? { indexed_chunks: 0, stale_chunks: 0 } : stats;
    return {
      enabled: Boolean(this.embeddingProvider),
      embedding_provider: this.embeddingProvider?.id ?? null,
      embedding_model: this.embeddingProvider?.model ?? null,
      embedding_dimensions: this.embeddingProvider?.dimensions ?? null,
      embedding_prompt_policy: this.embeddingProvider?.promptPolicy ?? null,
      vector_index_status: !this.embeddingProvider ? "unavailable" : syncStats.indexed_chunks > 0 ? "available" : "empty",
      indexed_chunks: syncStats.indexed_chunks,
      stale_chunks: syncStats.stale_chunks
    };
  }

  private async vectorIndexStatus(): Promise<"available" | "unavailable" | "empty"> {
    if (!this.embeddingProvider) return "unavailable";
    const stats = await this.store.ragVectorStats(this.embeddingProfile());
    return stats.indexed_chunks > 0 ? "available" : "empty";
  }

  private metadata(modeRequested: RagMode, modeUsed: RagModeUsed, degraded: boolean, fallbackReason: RagFallbackReason, vectorState: "available" | "unavailable" | "empty"): RagMetadata {
    return {
      mode_requested: modeRequested,
      mode_used: modeUsed,
      degraded,
      fallback_reason: fallbackReason,
      embedding_provider: this.embeddingProvider?.id ?? null,
      embedding_model: this.embeddingProvider?.model ?? null,
      embedding_prompt_policy: this.embeddingProvider?.promptPolicy ?? null,
      vector_index_status: vectorState,
      warnings: degraded && fallbackReason ? [`rag_degraded:${fallbackReason}`] : []
    };
  }

  private embeddingProfile(): RagEmbeddingProfile {
    if (!this.embeddingProvider) throw vectorUnavailable("embedding_provider_missing");
    return {
      id: stableId("embedding_profile", {
        provider: this.embeddingProvider.id,
        model: this.embeddingProvider.model,
        dimensions: this.embeddingProvider.dimensions,
        prompt_policy: this.embeddingProvider.promptPolicy
      }),
      provider_id: this.embeddingProvider.id,
      model: this.embeddingProvider.model,
      dimensions: this.embeddingProvider.dimensions,
      prompt_policy: this.embeddingProvider.promptPolicy
    };
  }
}

export class DeterministicEmbeddingProvider implements RagEmbeddingProvider {
  readonly id = "testing_deterministic";
  readonly model = "testing-deterministic-embedding-v1";
  readonly dimensions: number;
  readonly promptPolicy = "testing.hash-buckets.v1";

  constructor(dimensions = 32) {
    this.dimensions = dimensions;
  }

  async embedQuery(text: string): Promise<number[]> {
    return deterministicVector(`query:${text}`, this.dimensions);
  }

  async embedDocuments(documents: RagEmbeddingDocument[]): Promise<number[][]> {
    return documents.map((document) => deterministicVector(`document:${document.title ?? ""}:${document.text}`, this.dimensions));
  }
}

function toRagItem(result: SearchResult, query: string): RagSearchItem {
  const citation: RagCitation = {
    id: stableId("rag_citation", { source: result.source.id, chunk: result.chunk_id, query }),
    source_id: result.source.id,
    chunk_id: result.chunk_id,
    title: result.source.title,
    uri: result.source.uri,
    quote: result.text.slice(0, 700)
  };
  const score_breakdown: RagScoreBreakdown = { lexical: result.score, structured: 0, vector: 0, freshness_penalty: 0, authority_boost: 0, total: result.score };
  return { source_id: result.source.id, chunk_id: result.chunk_id, text: result.text, title: result.source.title, citation, score: result.score, score_breakdown };
}

function structuredScore(result: SearchResult, query: string): number {
  const haystack = `${result.source.title} ${JSON.stringify(result.source.metadata ?? {})}`.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  return terms.filter((term) => haystack.includes(term)).length / terms.length;
}

function totalScore(score: RagScoreBreakdown): number {
  return score.lexical + score.structured * 0.35 + score.vector * 0.8 + score.authority_boost - score.freshness_penalty;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function assertVectorDimensions(vector: number[], dimensions: number): void {
  if (vector.length !== dimensions) {
    throw new RagEmbeddingProviderError(`Embedding dimension mismatch: expected ${dimensions}, received ${vector.length}`, { retryable: false });
  }
}

function storedEmbeddingToSearchResult(entry: RagStoredEmbedding): SearchResult {
  return {
    source: entry.source,
    chunk_id: entry.chunk_id,
    text: entry.text,
    redacted: false,
    score: 0
  };
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === "function";
}

function deterministicVector(input: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (const token of input.toLowerCase().split(/\W+/).filter(Boolean)) {
    const hash = sha256(token);
    const bucket = Number.parseInt(hash.slice(0, 8), 16) % dimensions;
    const sign = Number.parseInt(hash.slice(8, 10), 16) % 2 === 0 ? 1 : -1;
    vector[bucket] = (vector[bucket] ?? 0) + sign * (1 + token.length / 20);
  }
  return vector;
}

async function safeEmbedQuery(provider: RagEmbeddingProvider, query: string): Promise<number[]> {
  try {
    return await provider.embedQuery(query);
  } catch (error) {
    throw new RagEmbeddingProviderError("Embedding query failed", { cause: error, retryable: isRetryable(error) });
  }
}

async function safeEmbedDocuments(provider: RagEmbeddingProvider, documents: RagEmbeddingDocument[]): Promise<number[][]> {
  try {
    return await provider.embedDocuments(documents);
  } catch (error) {
    throw new RagEmbeddingProviderError("Embedding document failed", { cause: error, retryable: isRetryable(error) });
  }
}

function vectorUnavailable(reason: Exclude<RagFallbackReason, null>): RagVectorUnavailableError {
  return new RagVectorUnavailableError(`Vector RAG is unavailable: ${reason}`, reason);
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("rate") || message.includes("quota") || message.includes("timeout") || message.includes("temporarily");
}
