import { contentHash } from "../../core/hash/index.js";
import { stableId } from "../../core/ids/index.js";
import { defaultAccessPolicy, policyResolver } from "../../core/policy/index.js";
import type { ActorRef, AtlasRecord, ContextPackRecord, PolicyDecision, ProposalRecord, RecordRef, SchemaContractRecord, SourceRecord, StructuredObjectRecord } from "../../core/records/index.js";
import { nowIso } from "../../core/time/index.js";
import { validateRecord } from "../../core/validation/index.js";
import { chunkText } from "../../ingest/chunker.js";
import { redactText } from "../../security/redaction.js";
import { builtInSchemaContracts, candidateSourceRefs, extractStructured, normalizeSchemaContract, structuredContentHash, structuredStableId } from "../../structured/index.js";
import type { StructuredSchemaContract } from "../../structured/index.js";
import type { AtlasWikiStore, CasWriteOptions, ChunkSearchInput, ChunkSearchResult, IngestInput, ProposeChangeInput, ProposeClaimInput, ProposalType, RagChunkEmbedding, RagEmbeddingProfile, RagIndexChunk, RagStoredEmbedding, RagVectorStats, SearchResult, StructuredIngestInput, StructuredIngestResult, ValidationReport, VectorSearchInput, VectorSearchResult, WriteOptions, WriteResult } from "../store-contract.js";
import { createSupabaseClient } from "./client.js";
import { SupabaseStoreError } from "./errors.js";
import { recordToRow, rowToRecord } from "./mappers.js";
import { sourceAclRows } from "./policy.js";
import { callRpc } from "./rpc.js";
import type { SupabaseLikeClient, SupabaseStoreOptions } from "./types.js";

const SUPABASE_DEFAULT_VECTOR_DIMENSIONS = 1536;

export class SupabaseStore implements AtlasWikiStore {
  readonly options: SupabaseStoreOptions;
  private client: SupabaseLikeClient | undefined;
  private schemaContracts = new Map<string, StructuredSchemaContract>(builtInSchemaContracts.map((contract) => [contract.id, normalizeSchemaContract(contract)]));

  constructor(options: SupabaseStoreOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    this.client = await createSupabaseClient(this.options);
  }

  async close(): Promise<void> {}

  async ingestText(input: IngestInput): Promise<SourceRecord> {
    const client = this.requireClient();
    const time = nowIso();
    const visibility = input.visibility ?? "private";
    const seed = { title: input.title, uri: input.uri, text_hash: contentHash(input.text) };
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
      acl: defaultAccessPolicy(visibility, input.owner),
      sensitivity: input.sensitivity ?? (visibility === "public" ? "public" : "internal"),
      freshness: { updated_at: time, stale_after: input.stale_after },
      metadata: input.metadata
    };
    validateRecord(source);
    await checked(client.from("records").upsert(recordToRow(source)), "supabase records upsert");
    await checked(client.from("sources").upsert({
      id: source.id,
      source_type: source.source_type,
      title: source.title,
      uri: source.uri ?? null,
      owner_id: source.owner?.id ?? null,
      content_hash: source.content_hash,
      stale_after: source.freshness.stale_after ?? null,
      updated_at: source.updated_at,
      metadata: source.metadata ?? {}
    }), "supabase sources upsert");
    const aclRows = sourceAclRows(source);
    if (aclRows.length > 0) await checked(client.from("record_acl").upsert(aclRows), "supabase acl upsert");
    const chunkRows = chunkText(input.text).map((chunk) => ({
      id: stableId("chunk", { source_id: source.id, ordinal: chunk.ordinal, text_hash: chunk.text_hash }),
      source_id: source.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      text_hash: chunk.text_hash,
      locator_json: null,
      created_at: time,
      metadata: {}
    }));
    if (chunkRows.length > 0) await checked(client.from("chunks").upsert(chunkRows), "supabase chunks upsert");
    await this.audit("ingest", this.options.actor ?? { id: "service:ingest", type: "service" }, [{ id: source.id, schema: source.schema, kind: source.kind }], [{ record_ref: { id: source.id, schema: source.schema, kind: source.kind }, allowed: true, reason: "ingest_committed" }], "success");
    return source;
  }

  async ingestStructured(input: StructuredIngestInput): Promise<StructuredIngestResult> {
    if (input.mode === "commit" && !input.trusted) throw new Error("Structured direct commit requires trusted: true");
    const source = await this.ingestText(input);
    const candidates = await extractStructured({ source, text: input.text, schemas: input.schemas }, { schemaContracts: await this.listSchemaContracts() });
    const structuredObjects: StructuredObjectRecord[] = [];
    const proposals: ProposalRecord[] = [];
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
      structuredObjects.push(object);
      if (input.mode === "commit") await this.upsertRecord(object, { actor: input.actor });
      else proposals.push(await this.proposeChange("update", { text: "Structured extraction proposal for " + object.object_type, source_id: source.id, requested_by: input.actor ?? { id: "service:structured", type: "service" }, owner: source.owner?.id }));
    }
    return { source, structuredObjects, proposals, warnings: candidates.flatMap((candidate) => candidate.warnings) };
  }

  async search(query: string, actor: ActorRef, limit = 10): Promise<SearchResult[]> {
    return this.searchChunks({ query, actor, limit });
  }

  async searchChunks(input: ChunkSearchInput): Promise<ChunkSearchResult[]> {
    const { query, actor, limit = 10 } = input;
    if (!query.trim()) return [];
    const rows = await callRpc(this.requireClient(), "chunk_search", {
      search_text: query,
      max_results: limit,
      actor_id: actor.id,
      actor_groups: actor.groups ?? []
    }) as unknown[];
    return this.rpcRowsToChunkResults(rows, actor, limit);
  }

  async listSources(query: string | undefined, actor: ActorRef, limit = 50): Promise<SourceRecord[]> {
    if (query?.trim()) return (await this.search(query, actor, limit)).map((result) => result.source);
    const rows = await checked(this.requireClient().from("records").select("json").eq("kind", "source").is("deleted_at", null).limit(limit), "supabase list sources") as Array<{ json: unknown }>;
    return rows.map(rowToRecord).filter((record): record is SourceRecord => record.kind === "source").filter((source) => policyResolver.canRead({ record: source, actor, purpose: "supabase_list_sources" }).allowed);
  }

  async fetch(id: string, actor: ActorRef): Promise<AtlasRecord | undefined> {
    const row = await checked(this.requireClient().from("records").select("json").eq("id", id).is("deleted_at", null).maybeSingle(), "supabase fetch") as { json?: unknown } | null;
    if (!row) return undefined;
    const record = rowToRecord(row);
    return policyResolver.canRead({ record, actor, purpose: "supabase_fetch" }).allowed ? record : undefined;
  }

  async validateAccess(id: string, actor: ActorRef): Promise<boolean> {
    return Boolean(await this.fetch(id, actor));
  }

  async contextPack(query: string, actor: ActorRef, limit = 10): Promise<ContextPackRecord> {
    const results = await this.search(query, actor, limit);
    const time = nowIso();
    return validateRecord({
      schema: "atlas.wiki.context-pack.v1",
      kind: "context_pack",
      id: stableId("context_pack", { query, actor: actor.id, refs: results.map((result) => result.source.id) }),
      status: "active",
      created_at: time,
      updated_at: time,
      revision: 1,
      content_hash: contentHash({ query, actor: actor.id, refs: results.map((result) => result.source.id) }),
      query,
      actor,
      included_refs: results.map((result) => ({ id: result.source.id, schema: result.source.schema, kind: result.source.kind })),
      citations: results.map((result) => ({ id: stableId("citation", { source: result.source.id }), source_ref: { id: result.source.id, schema: result.source.schema, kind: result.source.kind }, title: result.source.title, quote: result.text.slice(0, 500) })),
      redactions: results.flatMap((result) => result.redactions ?? []),
      freshness_markers: [],
      conflict_markers: [],
      policy_decisions: results.map((result) => ({ record_ref: { id: result.source.id, schema: result.source.schema, kind: result.source.kind }, allowed: true, reason: "rls_allow" })),
      denied_count: 0,
      redacted_count: results.flatMap((result) => result.redactions ?? []).length,
      stale_count: 0,
      conflict_count: 0,
      candidate_count: results.length,
      authorized_count: results.length,
      query_backend: "none"
    }) as ContextPackRecord;
  }

  async proposeClaim(input: ProposeClaimInput): Promise<ProposalRecord> {
    return this.propose("claim", input);
  }

  async proposeChange(type: ProposalType, input: ProposeChangeInput): Promise<ProposalRecord> {
    return this.propose(type, input);
  }

  async upsertRecord(record: AtlasRecord, options: WriteOptions = {}): Promise<WriteResult> {
    const existing = await this.fetch(record.id, options.actor ?? this.options.actor ?? { id: "service:store", type: "service" });
    if (options.expectedRevision !== undefined && existing?.revision !== options.expectedRevision) {
      throw new SupabaseStoreError("Write conflict for record: " + record.id, { expectedRevision: options.expectedRevision, actualRevision: existing?.revision });
    }
    const finalRecord = validateRecord({ ...record, revision: existing && options.expectedRevision !== undefined ? options.expectedRevision + 1 : record.revision, updated_by: options.actor ?? record.updated_by });
    await checked(this.requireClient().from("records").upsert(recordToRow(finalRecord)), "supabase record upsert");
    return { record: finalRecord, created: !existing, previousRevision: existing?.revision, revision: finalRecord.revision };
  }

  async upsertRecordCas(record: AtlasRecord, options: CasWriteOptions): Promise<WriteResult> {
    if (options.expectedRevision === undefined) throw new SupabaseStoreError("CAS write requires expectedRevision", { id: record.id });
    const finalRecord = validateRecord({ ...record, updated_by: options.actor ?? record.updated_by });
    const rows = await callRpc(this.requireClient(), "upsert_record_cas", {
      record_json: finalRecord,
      expected_revision: options.expectedRevision,
      allow_create: Boolean(options.allowCreate)
    });
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (!isRecord(result)) throw new SupabaseStoreError("Supabase CAS RPC returned no row", { id: record.id });
    const saved = rowToRecord({ json: result.record_json ?? finalRecord });
    return {
      record: saved,
      created: Boolean(result.created),
      previousRevision: numberField(result, "previous_revision"),
      revision: numberField(result, "revision") ?? saved.revision
    };
  }

  async registerSchemaContract(contract: StructuredSchemaContract): Promise<void> {
    const normalized = normalizeSchemaContract(contract);
    this.schemaContracts.set(normalized.id, normalized);
    const time = nowIso();
    const record: SchemaContractRecord = {
      schema: "atlas.wiki.schema-contract.v1",
      kind: "schema_contract",
      id: normalized.id,
      status: "active",
      created_at: time,
      updated_at: time,
      revision: 1,
      content_hash: contentHash(normalized),
      name: normalized.name,
      version: normalized.version,
      description: normalized.description,
      json_schema: normalized.jsonSchema,
      required_fields: normalized.requiredFields,
      identity_fields: normalized.identityFields,
      confidence_threshold: normalized.confidenceThreshold,
      conflict_keys: normalized.conflictKeys
    };
    await this.upsertRecord(record, { actor: this.options.actor ?? { id: "service:schema-registry", type: "service" } });
  }

  async listSchemaContracts(): Promise<StructuredSchemaContract[]> {
    return [...this.schemaContracts.values()].map(normalizeSchemaContract);
  }

  async getSchemaContract(id: string): Promise<StructuredSchemaContract | undefined> {
    const contract = this.schemaContracts.get(id);
    return contract ? normalizeSchemaContract(contract) : undefined;
  }

  async validate(): Promise<ValidationReport> {
    return { ok: true, findings: [] };
  }

  migrationReport() {
    return { ok: true, backend: "supabase", applied_count: 0, pending_count: 0 };
  }

  async listRagIndexChunks(actor: ActorRef, limit = 100): Promise<RagIndexChunk[]> {
    const rows = await checked(this.requireClient().from("chunks").select("*").limit(limit * 4), "supabase rag chunks select") as Array<{ id: string; source_id: string; text: string; text_hash: string }>;
    const chunks: RagIndexChunk[] = [];
    for (const row of rows) {
      const record = await this.fetch(row.source_id, actor);
      if (!record || record.kind !== "source") continue;
      chunks.push({ source: record as SourceRecord, chunk_id: row.id, text: row.text, content_hash: row.text_hash });
      if (chunks.length >= limit) break;
    }
    return chunks;
  }

  async upsertRagEmbeddingProfile(profile: RagEmbeddingProfile): Promise<void> {
    assertSupabaseVectorDimensions(profile.dimensions);
    await checked(this.requireClient().from("embedding_profiles").upsert({
      id: profile.id,
      provider_id: profile.provider_id,
      model: profile.model,
      dimensions: profile.dimensions,
      prompt_policy: profile.prompt_policy,
      metadata: profile.metadata ?? {}
    }), "supabase embedding profile upsert");
  }

  async upsertRagChunkEmbedding(embedding: RagChunkEmbedding): Promise<void> {
    assertSupabaseVectorDimensions(embedding.dimensions, embedding.vector);
    await checked(this.requireClient().from("embeddings").upsert({
      id: stableId("embedding", { profile_id: embedding.profile_id, chunk_id: embedding.chunk_id }),
      chunk_id: embedding.chunk_id,
      profile_id: embedding.profile_id,
      provider_id: embedding.provider_id,
      model: embedding.model,
      dimensions: embedding.dimensions,
      content_hash: embedding.content_hash,
      embedding: embedding.vector,
      vector_json: embedding.vector,
      created_at: nowIso(),
      stale_at: null
    }), "supabase embedding upsert");
  }

  async listRagChunkEmbeddings(profile: RagEmbeddingProfile, actor: ActorRef, limit = 100): Promise<RagStoredEmbedding[]> {
    const rows = await checked(this.requireClient().from("embeddings").select("*").eq("profile_id", profile.id).is("stale_at", null).limit(limit * 4), "supabase embeddings select") as Array<{ chunk_id: string; profile_id: string; provider_id: string; model: string; dimensions: number; content_hash: string; embedding?: unknown; vector_json?: unknown }>;
    const chunkRows = await checked(this.requireClient().from("chunks").select("*").limit(limit * 8), "supabase vector chunks select") as Array<{ id: string; source_id: string; text: string; text_hash: string }>;
    const chunksById = new Map(chunkRows.map((row) => [row.id, row]));
    const stored: RagStoredEmbedding[] = [];
    for (const row of rows) {
      const chunk = chunksById.get(row.chunk_id);
      if (!chunk || chunk.text_hash !== row.content_hash) continue;
      const record = await this.fetch(chunk.source_id, actor);
      if (!record || record.kind !== "source") continue;
      const source = record as SourceRecord;
      const vector = normalizeVector(row.embedding ?? row.vector_json);
      if (!vector) continue;
      const redaction = redactText(chunk.text, { id: source.id, schema: source.schema, kind: source.kind }, { field: "text", sensitivity: source.sensitivity });
      stored.push({
        source,
        text: redaction.text,
        chunk_id: row.chunk_id,
        profile_id: row.profile_id,
        provider_id: row.provider_id,
        model: row.model,
        dimensions: row.dimensions,
        content_hash: row.content_hash,
        vector
      });
      if (stored.length >= limit) break;
    }
    return stored;
  }

  async vectorSearch(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    assertSupabaseVectorDimensions(input.profile.dimensions, input.queryVector);
    const rows = await callRpc(this.requireClient(), "rag_search", {
      query_embedding: input.queryVector,
      target_profile_id: input.profile.id,
      max_results: input.limit ?? 100,
      actor_id: input.actor.id,
      actor_groups: input.actor.groups ?? []
    }) as unknown[];
    const results: VectorSearchResult[] = [];
    for (const row of rows) {
      const result = await this.rpcRowToVectorResult(row, input.actor, input.profile);
      if (!result) continue;
      results.push(result);
      if (results.length >= (input.limit ?? 100)) break;
    }
    return results;
  }

  async ragVectorStats(profile: RagEmbeddingProfile): Promise<RagVectorStats> {
    const rows = await checked(this.requireClient().from("embeddings").select("chunk_id,content_hash,stale_at").eq("profile_id", profile.id).limit(10000), "supabase embedding stats select") as Array<{ chunk_id: string; content_hash: string; stale_at?: string | null | undefined }>;
    const chunkRows = await checked(this.requireClient().from("chunks").select("id,text_hash").limit(10000), "supabase chunk stats select") as Array<{ id: string; text_hash: string }>;
    const hashes = new Map(chunkRows.map((row) => [row.id, row.text_hash]));
    let indexed = 0;
    let stale = 0;
    for (const row of rows) {
      if (!row.stale_at && hashes.get(row.chunk_id) === row.content_hash) indexed += 1;
      else stale += 1;
    }
    return { indexed_chunks: indexed, stale_chunks: stale };
  }

  async audit(event_type: string, actor: ActorRef, refs: RecordRef[], decisions: PolicyDecision[], outcome: "success" | "denied" | "error"): Promise<void> {
    await checked(this.requireClient().from("audit_events").insert({
      id: stableId("audit", { event_type, actor, refs, decisions, outcome, at: nowIso() }),
      event_type,
      actor_json: actor,
      record_refs_json: refs,
      policy_decisions_json: decisions,
      outcome,
      created_at: nowIso(),
      hash_self: contentHash({ event_type, actor, refs, decisions, outcome })
    }), "supabase audit insert");
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
    await this.upsertRecord(proposal, { actor: input.requested_by });
    return proposal;
  }

  private requireClient(): SupabaseLikeClient {
    if (!this.client) throw new SupabaseStoreError("SupabaseStore.init() has not completed");
    return this.client;
  }

  private async rpcRowsToChunkResults(rows: unknown[], actor: ActorRef, limit: number): Promise<ChunkSearchResult[]> {
    const results: ChunkSearchResult[] = [];
    for (const row of rows) {
      const result = await this.rpcRowToChunkResult(row, actor);
      if (!result) continue;
      results.push(result);
      if (results.length >= limit) break;
    }
    return results;
  }

  private async rpcRowToChunkResult(value: unknown, actor: ActorRef): Promise<ChunkSearchResult | undefined> {
    if (!isRecord(value)) return undefined;
    const source = await this.sourceFromRpcRow(value, actor);
    if (!source) return undefined;
    const text = stringField(value, "text") ?? stringField(value, "chunk_text") ?? stringField(value, "content");
    const chunkId = stringField(value, "chunk_id") ?? stringField(value, "id");
    if (!text || !chunkId) return undefined;
    const redaction = redactText(text, { id: source.id, schema: source.schema, kind: source.kind }, { field: "text", sensitivity: source.sensitivity });
    return {
      source,
      chunk_id: chunkId,
      text: redaction.text,
      redacted: redaction.events.length > 0,
      redactions: redaction.events,
      score: numberField(value, "score") ?? numberField(value, "similarity") ?? 1,
      backend: "supabase",
      retrieval_path: "supabase_chunk_rpc"
    };
  }

  private async rpcRowToVectorResult(value: unknown, actor: ActorRef, profile: RagEmbeddingProfile): Promise<VectorSearchResult | undefined> {
    if (!isRecord(value)) return undefined;
    const chunk = await this.rpcRowToChunkResult(value, actor);
    if (!chunk) return undefined;
    const vector = normalizeVector(value.embedding ?? value.vector_json ?? value.vector);
    if (!vector) return undefined;
    return {
      source: chunk.source,
      text: chunk.text,
      chunk_id: chunk.chunk_id,
      profile_id: stringField(value, "profile_id") ?? profile.id,
      provider_id: stringField(value, "provider_id") ?? profile.provider_id,
      model: stringField(value, "model") ?? profile.model,
      dimensions: numberField(value, "dimensions") ?? profile.dimensions,
      content_hash: stringField(value, "content_hash") ?? stringField(value, "text_hash") ?? "",
      vector,
      score: chunk.score,
      backend: "supabase",
      retrieval_path: "supabase_rag_rpc"
    };
  }

  private async sourceFromRpcRow(row: Record<string, unknown>, actor: ActorRef): Promise<SourceRecord | undefined> {
    const sourceJson = row.source_json ?? row.source;
    if (sourceJson) {
      const record = rowToRecord({ json: typeof sourceJson === "string" ? JSON.parse(sourceJson) : sourceJson });
      if (record.kind !== "source") return undefined;
      return policyResolver.canRead({ record, actor, purpose: "supabase_rag_rpc" }).allowed ? record as SourceRecord : undefined;
    }
    const sourceId = stringField(row, "source_id");
    if (!sourceId) return undefined;
    const record = await this.fetch(sourceId, actor);
    return record?.kind === "source" ? record as SourceRecord : undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
  return typeof value[key] === "number" ? value[key] : undefined;
}

function normalizeVector(value: unknown): number[] | undefined {
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "number")) return parsed;
  } catch {
    const csv = trimmed.replace(/^\[|\]$/g, "").split(",").map((item) => Number(item.trim()));
    if (csv.length > 0 && csv.every(Number.isFinite)) return csv;
  }
  return undefined;
}

function assertSupabaseVectorDimensions(dimensions: number, vector?: readonly number[]): void {
  if (dimensions !== SUPABASE_DEFAULT_VECTOR_DIMENSIONS || (vector && vector.length !== SUPABASE_DEFAULT_VECTOR_DIMENSIONS)) {
    throw new SupabaseStoreError("Supabase pgvector RPC supports 1536 dimensions by default; custom dimensions require an explicit project migration", {
      expected: SUPABASE_DEFAULT_VECTOR_DIMENSIONS,
      dimensions,
      vectorDimensions: vector?.length
    });
  }
}

async function checked(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, context: string): Promise<unknown> {
  const result = await query;
  if (result.error) throw new SupabaseStoreError(result.error.message, { context });
  return result.data;
}
