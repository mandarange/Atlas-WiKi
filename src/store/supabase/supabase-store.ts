import { contentHash } from "../../core/hash/index.js";
import { stableId } from "../../core/ids/index.js";
import { defaultAccessPolicy, policyResolver } from "../../core/policy/index.js";
import type { ActorRef, AtlasRecord, ContextPackRecord, PolicyDecision, ProposalRecord, RecordRef, SourceRecord, StructuredObjectRecord } from "../../core/records/index.js";
import { nowIso } from "../../core/time/index.js";
import { validateRecord } from "../../core/validation/index.js";
import { chunkText } from "../../ingest/chunker.js";
import { redactText } from "../../security/redaction.js";
import { candidateSourceRefs, extractStructured, structuredContentHash, structuredStableId } from "../../structured/index.js";
import type { AtlasWikiStore, IngestInput, ProposeChangeInput, ProposeClaimInput, ProposalType, RagChunkEmbedding, RagEmbeddingProfile, RagIndexChunk, RagStoredEmbedding, RagVectorStats, SearchResult, StructuredIngestInput, StructuredIngestResult, ValidationReport, WriteOptions, WriteResult } from "../store-contract.js";
import { createSupabaseClient } from "./client.js";
import { SupabaseStoreError } from "./errors.js";
import { recordToRow, rowToRecord } from "./mappers.js";
import { sourceAclRows } from "./policy.js";
import type { SupabaseLikeClient, SupabaseStoreOptions } from "./types.js";

export class SupabaseStore implements AtlasWikiStore {
  readonly options: SupabaseStoreOptions;
  private client: SupabaseLikeClient | undefined;

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
    const candidates = await extractStructured({ source, text: input.text, schemas: input.schemas });
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
    if (!query.trim()) return [];
    const rows = await checked(this.requireClient().from("chunks").select("*").limit(limit * 8), "supabase chunk search select") as Array<{ id: string; source_id: string; text: string; text_hash?: string | undefined }>;
    const q = query.toLowerCase();
    const results: SearchResult[] = [];
    for (const row of rows.filter((candidate) => candidate.text.toLowerCase().includes(q))) {
      const record = await this.fetch(row.source_id, actor);
      if (!record || record.kind !== "source") continue;
      const source = record as SourceRecord;
      const redaction = redactText(row.text, { id: source.id, schema: source.schema, kind: source.kind }, { field: "text", sensitivity: source.sensitivity });
      results.push({ source, chunk_id: row.id, text: redaction.text, redacted: redaction.events.length > 0, redactions: redaction.events, score: 1 });
      if (results.length >= limit) break;
    }
    return results;
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

async function checked(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, context: string): Promise<unknown> {
  const result = await query;
  if (result.error) throw new SupabaseStoreError(result.error.message, { context });
  return result.data;
}
