import { contentHash } from "../core/hash/index.js";
import { stableId } from "../core/ids/index.js";
import { WriteConflictError } from "../core/errors/index.js";
import { defaultAccessPolicy, policyResolver, sourcePolicyDecision } from "../core/policy/index.js";
import type { ActorRef, AtlasRecord, ContextPackRecord, PolicyDecision, ProposalRecord, RecordRef, SourceRecord, StructuredObjectRecord } from "../core/records/index.js";
import { isPastIso, nowIso } from "../core/time/index.js";
import { validateRecord } from "../core/validation/index.js";
import { redactText } from "../security/redaction.js";
import { candidateSourceRefs, extractStructured, structuredContentHash, structuredStableId } from "../structured/index.js";
import type { AtlasWikiStore, IngestInput, ProposeChangeInput, ProposeClaimInput, ProposalType, SearchResult, StructuredIngestInput, StructuredIngestResult, WriteOptions, WriteResult } from "./store-contract.js";

export class MemoryStore implements AtlasWikiStore {
  private sources: Array<{ source: SourceRecord; text: string }> = [];
  private records = new Map<string, AtlasRecord>();
  private auditEvents: Array<{ event_type: string; actor: ActorRef; refs: RecordRef[]; decisions: PolicyDecision[]; outcome: "success" | "denied" | "error" }> = [];

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
    const candidates = await extractStructured({ source, text: input.text, schemas: input.schemas });
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
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return this.sources
      .filter(({ source }) => sourcePolicyDecision(source, actor).allowed)
      .filter(({ text, source }) => text.toLowerCase().includes(q) || source.title.toLowerCase().includes(q))
      .slice(0, limit)
      .map(({ source, text }) => {
        const redacted = redactText(text, { id: source.id, schema: source.schema, kind: source.kind });
        return { source, chunk_id: `${source.id}_chunk`, text: redacted.text, redacted: redacted.events.length > 0, score: 1 };
      });
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
