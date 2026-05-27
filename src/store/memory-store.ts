import { contentHash } from "../core/hash/index.js";
import { stableId } from "../core/ids/index.js";
import { WriteConflictError } from "../core/errors/index.js";
import { defaultAccessPolicy, policyResolver, sourcePolicyDecision } from "../core/policy/index.js";
import type { ActorRef, AtlasRecord, ContextPackRecord, PolicyDecision, ProposalRecord, RecordRef, SourceRecord, StructuredObjectRecord } from "../core/records/index.js";
import { isPastIso, nowIso } from "../core/time/index.js";
import { validateRecord } from "../core/validation/index.js";
import { chunkText } from "../ingest/chunker.js";
import { redactText } from "../security/redaction.js";
import { builtInSchemaContracts, candidateSourceRefs, extractStructured, normalizeSchemaContract, structuredContentHash, structuredStableId } from "../structured/index.js";
import type { StructuredSchemaContract } from "../structured/index.js";
import type { AtlasWikiStore, CasWriteOptions, ChunkSearchInput, ChunkSearchResult, IngestInput, ProposeChangeInput, ProposeClaimInput, ProposalType, RagChunkEmbedding, RagEmbeddingProfile, RagIndexChunk, RagStoredEmbedding, RagVectorStats, SearchResult, StructuredIngestInput, StructuredIngestResult, VectorSearchInput, VectorSearchResult, WriteOptions, WriteResult } from "./store-contract.js";

export class MemoryStore implements AtlasWikiStore {
  private sources: Array<{ source: SourceRecord; text: string }> = [];
  private records = new Map<string, AtlasRecord>();
  private auditEvents: Array<{ event_type: string; actor: ActorRef; refs: RecordRef[]; decisions: PolicyDecision[]; outcome: "success" | "denied" | "error" }> = [];
  private embeddingProfiles = new Map<string, RagEmbeddingProfile>();
  private chunkEmbeddings = new Map<string, RagChunkEmbedding>();
  private schemaContracts = new Map<string, StructuredSchemaContract>(builtInSchemaContracts.map((contract) => [contract.id, normalizeSchemaContract(contract)]));

  async init(): Promise<void> {}

  async ingestText(input: IngestInput): Promise<SourceRecord> {
    const time = nowIso();
    const seed = { title: input.title, text: input.text, uri: input.uri };
    const source: SourceRecord = {
      schema: "atlas.wiki.source.v1",
      kind: "source",
      id: stableId("source", seed),
      status: "active",
      created_at: time,
      updated_at: time,
      revision: 1,
      content_hash: contentHash(seed),
      source_type: "manual",
      title: input.title,
      uri: input.uri,
      owner: input.owner ? { id: input.owner, type: input.owner.startsWith("team:") ? "team" : "user" } : undefined,
      acl: defaultAccessPolicy(input.visibility ?? "private", input.owner),
      sensitivity: input.sensitivity ?? "internal",
      freshness: { updated_at: time, stale_after: input.stale_after },
      metadata: input.metadata
    };
    validateRecord(source);
    this.records.set(source.id, source);
    const index = this.sources.findIndex((entry) => entry.source.id === source.id);
    if (index >= 0) this.sources[index] = { source, text: input.text };
    else this.sources.push({ source, text: input.text });
    this.audit("ingest", { id: "service:ingest", type: "service" }, [{ id: source.id, schema: source.schema, kind: source.kind }], [{ record_ref: { id: source.id, schema: source.schema, kind: source.kind }, allowed: true, reason: "ingest_committed" }], "success");
    return source;
  }

  async ingestStructured(input: StructuredIngestInput): Promise<StructuredIngestResult> {
    if (input.mode === "commit" && !input.trusted) throw new Error("Structured direct commit requires trusted: true");
    const source = await this.ingestText(input);
    const candidates = await extractStructured({ source, text: input.text, schemas: input.schemas }, { schemaContracts: await this.listSchemaContracts() });
    const structuredObjects: StructuredObjectRecord[] = [];
    const proposals: ProposalRecord[] = [];
    const warnings = candidates.flatMap((candidate) => candidate.warnings);
    for (const candidate of candidates) {
      const time = nowIso();
      const object: StructuredObjectRecord = {
        schema: "atlas.wiki.structured-object.v1",
        kind: "structured_object",
        id: structuredStableId(source, candidate),
        status: input.mode === "commit" ? "active" : "pending_approval",
        created_at: time,
        updated_at: time,
        revision: 1,
        content_hash: structuredContentHash(candidate),
        source_ref: { id: source.id, schema: source.schema, kind: source.kind },
        object_type: candidate.objectType,
        schema_id: candidate.schemaId,
        data: candidate.data,
        confidence: candidate.confidence,
        evidence_refs: candidateSourceRefs(candidate, source),
        acl: source.acl,
        sensitivity: source.sensitivity
      };
      validateRecord(object);
      if (input.mode === "commit") {
        await this.upsertRecord(object, { actor: input.actor });
        structuredObjects.push(object);
      } else {
        const proposal = await this.proposeChange("update", {
          text: "Structured extraction proposal for " + object.object_type,
          source_id: source.id,
          requested_by: input.actor ?? { id: "service:structured", type: "service" },
          owner: source.owner?.id
        });
        proposal.payload.structured_object = object;
        await this.upsertRecord(proposal, { expectedRevision: proposal.revision, actor: proposal.requested_by });
        structuredObjects.push(object);
        proposals.push(proposal);
      }
    }
    return { source, structuredObjects, proposals, warnings };
  }

  async search(query: string, actor: ActorRef, limit = 10): Promise<SearchResult[]> {
    return this.searchChunks({ query, actor, limit });
  }

  async searchChunks(input: ChunkSearchInput): Promise<ChunkSearchResult[]> {
    const { query, actor, limit = 10 } = input;
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const results: ChunkSearchResult[] = [];
    for (const { source, text } of this.sources) {
      if (!sourcePolicyDecision(source, actor).allowed) continue;
      for (const chunk of chunkText(text)) {
        if (!chunk.text.toLowerCase().includes(q) && !source.title.toLowerCase().includes(q)) continue;
        const ref = { id: source.id, schema: source.schema, kind: source.kind };
        const redacted = redactText(chunk.text, ref, { field: "text", sensitivity: source.sensitivity });
        results.push({
          source,
          chunk_id: stableId("chunk", { source_id: source.id, ordinal: chunk.ordinal, text_hash: chunk.text_hash }),
          text: redacted.text,
          redacted: redacted.events.length > 0,
          redactions: redacted.events,
          score: 1,
          backend: "memory",
          retrieval_path: "chunk_scan"
        });
        if (results.length >= limit) return results;
      }
    }
    return results;
  }

  async listSources(query: string | undefined, actor: ActorRef, limit = 50): Promise<SourceRecord[]> {
    if (query?.trim()) return (await this.search(query, actor, limit)).map((result) => result.source);
    return this.sources
      .filter(({ source }) => sourcePolicyDecision(source, actor).allowed)
      .slice(0, limit)
      .map(({ source }) => source);
  }

  async fetch(id: string, actor: ActorRef): Promise<AtlasRecord | undefined> {
    const record = this.records.get(id);
    if (!record) return undefined;
    if (record.kind === "source") return sourcePolicyDecision(record as SourceRecord, actor).allowed ? record : undefined;
    if ("acl" in record && record.acl) return policyResolver.canRead({ record, actor, purpose: "fetch" }).allowed ? record : undefined;
    return undefined;
  }

  async validateAccess(id: string, actor: ActorRef): Promise<boolean> {
    return Boolean(await this.fetch(id, actor));
  }

  async contextPack(query: string, actor: ActorRef, limit = 10): Promise<ContextPackRecord> {
    const results = await this.search(query, actor, limit);
    const time = nowIso();
    const citations = results.map((result) => {
      const ref = { id: result.source.id, schema: result.source.schema, kind: result.source.kind };
      return { id: stableId("citation", ref), source_ref: ref, title: result.source.title, uri: result.source.uri, quote: redactText(result.text, ref).text.slice(0, 500) };
    });
    const redactions = results.flatMap((result) => redactText(result.text, { id: result.source.id, schema: result.source.schema, kind: result.source.kind }).events);
    const freshness_markers = results.map((result) => ({
      record_ref: { id: result.source.id, schema: result.source.schema, kind: result.source.kind },
      stale: isPastIso(result.source.freshness.stale_after),
      stale_after: result.source.freshness.stale_after
    }));
    return {
      schema: "atlas.wiki.context-pack.v1",
      kind: "context_pack",
      id: stableId("context_pack", { query, actor, refs: results.map((result) => result.source.id) }),
      status: "active",
      created_at: time,
      updated_at: time,
      revision: 1,
      content_hash: contentHash({ query, actor, results: results.map((result) => result.source.id) }),
      query,
      actor,
      included_refs: results.map((result) => ({ id: result.source.id, schema: result.source.schema, kind: result.source.kind })),
      citations,
      redactions,
      freshness_markers,
      conflict_markers: [],
      policy_decisions: results.map((result) => ({ record_ref: { id: result.source.id, schema: result.source.schema, kind: result.source.kind }, allowed: true, reason: "acl_allow" })),
      denied_count: 0,
      redacted_count: redactions.length,
      stale_count: freshness_markers.filter((marker) => marker.stale).length,
      conflict_count: 0,
      candidate_count: results.length,
      authorized_count: results.length,
      query_backend: "none",
      fallback_reason: null
    };
  }

  async validate(): Promise<{ ok: boolean; findings: string[] }> {
    const findings: string[] = [];
    for (const record of this.records.values()) {
      try {
        validateRecord(record);
      } catch (error) {
        findings.push(`record_validation_failed:${String(error)}`);
      }
    }
    return { ok: findings.length === 0, findings };
  }

  async close(): Promise<void> {}

  async proposeClaim(input: ProposeClaimInput): Promise<ProposalRecord> {
    return this.propose("claim", input);
  }

  async proposeChange(type: ProposalType, input: ProposeChangeInput): Promise<ProposalRecord> {
    return this.propose(type, input);
  }

  async upsertRecord(record: AtlasRecord, options: WriteOptions = {}): Promise<WriteResult> {
    const existing = this.records.get(record.id);
    if (options.expectedRevision !== undefined && existing?.revision !== options.expectedRevision) {
      throw new WriteConflictError(record.id, options.expectedRevision, existing?.revision);
    }
    const finalRecord = validateRecord({
      ...record,
      revision: existing && options.expectedRevision !== undefined ? options.expectedRevision + 1 : record.revision,
      updated_by: options.actor ?? record.updated_by
    });
    this.records.set(finalRecord.id, finalRecord);
    this.audit("record.upsert", options.actor ?? { id: "service:store", type: "service" }, [{ id: finalRecord.id, schema: finalRecord.schema, kind: finalRecord.kind }], [{ record_ref: { id: finalRecord.id, schema: finalRecord.schema, kind: finalRecord.kind }, allowed: true, reason: "write_committed" }], "success");
    return { record: finalRecord, created: !existing, previousRevision: existing?.revision, revision: finalRecord.revision };
  }

  migrationReport() {
    return { ok: true, backend: "memory", applied_count: 0, pending_count: 0 };
  }

  async listRagIndexChunks(actor: ActorRef, limit = 100): Promise<RagIndexChunk[]> {
    const chunks: RagIndexChunk[] = [];
    for (const { source, text } of this.sources) {
      if (!sourcePolicyDecision(source, actor).allowed) continue;
      for (const chunk of chunkText(text)) {
        chunks.push({
          source,
          chunk_id: stableId("chunk", { source_id: source.id, ordinal: chunk.ordinal, text_hash: chunk.text_hash }),
          text: chunk.text,
          content_hash: chunk.text_hash
        });
        if (chunks.length >= limit) return chunks;
      }
    }
    return chunks;
  }

  async upsertRagEmbeddingProfile(profile: RagEmbeddingProfile): Promise<void> {
    this.embeddingProfiles.set(profile.id, profile);
  }

  async upsertRagChunkEmbedding(embedding: RagChunkEmbedding): Promise<void> {
    this.chunkEmbeddings.set(`${embedding.profile_id}:${embedding.chunk_id}`, embedding);
  }

  async listRagChunkEmbeddings(profile: RagEmbeddingProfile, actor: ActorRef, limit = 100): Promise<RagStoredEmbedding[]> {
    const chunkMap = new Map<string, RagIndexChunk>();
    for (const chunk of await this.listRagIndexChunks(actor, Number.MAX_SAFE_INTEGER)) chunkMap.set(chunk.chunk_id, chunk);
    const entries: RagStoredEmbedding[] = [];
    for (const embedding of this.chunkEmbeddings.values()) {
      if (embedding.profile_id !== profile.id) continue;
      const chunk = chunkMap.get(embedding.chunk_id);
      if (!chunk || chunk.content_hash !== embedding.content_hash) continue;
      const redaction = redactText(chunk.text, { id: chunk.source.id, schema: chunk.source.schema, kind: chunk.source.kind });
      entries.push({ ...embedding, source: chunk.source, text: redaction.text });
      if (entries.length >= limit) break;
    }
    return entries;
  }

  async vectorSearch(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    return (await this.listRagChunkEmbeddings(input.profile, input.actor, input.limit ?? 100))
      .map((entry) => ({
        ...entry,
        score: cosineSimilarity(input.queryVector, entry.vector),
        backend: "memory" as const,
        retrieval_path: "sqlite_vector_json" as const,
        profile_id: input.profile.id
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 100);
  }

  async ragVectorStats(profile: RagEmbeddingProfile): Promise<RagVectorStats> {
    return this.ragVectorStatsSync(profile);
  }

  ragVectorStatsSync(profile: RagEmbeddingProfile): RagVectorStats {
    const currentChunks = new Map<string, string>();
    for (const { source, text } of this.sources) {
      for (const chunk of chunkText(text)) {
        currentChunks.set(stableId("chunk", { source_id: source.id, ordinal: chunk.ordinal, text_hash: chunk.text_hash }), chunk.text_hash);
      }
    }
    let indexed = 0;
    let stale = 0;
    for (const embedding of this.chunkEmbeddings.values()) {
      if (embedding.profile_id !== profile.id) continue;
      const currentHash = currentChunks.get(embedding.chunk_id);
      if (currentHash === embedding.content_hash) indexed += 1;
      else stale += 1;
    }
    return { indexed_chunks: indexed, stale_chunks: stale };
  }

  async upsertRecordCas(record: AtlasRecord, options: CasWriteOptions): Promise<WriteResult> {
    const existing = this.records.get(record.id);
    if (!existing && !(options.allowCreate && options.expectedRevision === 0)) {
      throw new WriteConflictError(record.id, options.expectedRevision, undefined);
    }
    if (existing && existing.revision !== options.expectedRevision) {
      throw new WriteConflictError(record.id, options.expectedRevision, existing.revision);
    }
    return this.upsertRecord(record, existing ? options : { ...options, expectedRevision: undefined });
  }

  async registerSchemaContract(contract: StructuredSchemaContract): Promise<void> {
    const normalized = normalizeSchemaContract(contract);
    this.schemaContracts.set(normalized.id, normalized);
  }

  async listSchemaContracts(): Promise<StructuredSchemaContract[]> {
    return [...this.schemaContracts.values()].map(normalizeSchemaContract);
  }

  async getSchemaContract(id: string): Promise<StructuredSchemaContract | undefined> {
    const contract = this.schemaContracts.get(id);
    return contract ? normalizeSchemaContract(contract) : undefined;
  }

  audit(event_type: string, actor: ActorRef, refs: RecordRef[], decisions: PolicyDecision[], outcome: "success" | "denied" | "error"): void {
    this.auditEvents.push({ event_type, actor, refs, decisions, outcome });
  }

  private async propose(proposal_type: "claim" | ProposalType, input: ProposeClaimInput | ProposeChangeInput): Promise<ProposalRecord> {
    const time = nowIso();
    const proposal: ProposalRecord = {
      schema: "atlas.wiki.proposal.v1",
      kind: "proposal",
      id: stableId("proposal", { proposal_type, text: input.text, source_id: input.source_id, by: input.requested_by.id }),
      status: "pending_approval",
      created_at: time,
      updated_at: time,
      revision: 1,
      content_hash: contentHash({ proposal_type, text: input.text, source_id: input.source_id }),
      proposal_type,
      target_ref: input.source_id ? { id: input.source_id, schema: "atlas.wiki.source.v1", kind: "source" } : undefined,
      payload: { text: input.text, owner: input.owner },
      requested_by: input.requested_by,
      approval_status: "pending"
    };
    validateRecord(proposal);
    this.records.set(proposal.id, proposal);
    this.audit(`proposal.${proposal_type}`, input.requested_by, [{ id: proposal.id, schema: proposal.schema, kind: proposal.kind }], [{ allowed: true, reason: "write_as_proposal" }], "success");
    return proposal;
  }
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
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
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
