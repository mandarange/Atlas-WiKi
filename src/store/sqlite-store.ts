import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createSqliteBackup, verifySqliteBackup } from "../db/backup.js";
import { openDatabase } from "../db/connection.js";
import { applyMigrations } from "../db/migrations.js";
import { transaction } from "../db/transaction.js";
import { contentHash, sha256 } from "../core/hash/index.js";
import { stableId } from "../core/ids/index.js";
import { defaultAccessPolicy, sourcePolicyDecision } from "../core/policy/index.js";
import type { ActorRef, ContextPackRecord, PolicyDecision, ProposalRecord, SourceRecord } from "../core/records/index.js";
import { isPastIso, nowIso } from "../core/time/index.js";
import { validateRecord } from "../core/validation/index.js";
import { chunkText } from "../ingest/chunker.js";
import { redactText } from "../security/redaction.js";
import type { AtlasWikiStore, IngestInput, SearchResult } from "./store-contract.js";

interface SourceRow {
  json: string;
  text: string;
  chunk_id: string;
}

interface AuditRow {
  id: string;
  event_type: string;
  actor_json: string;
  record_refs_json: string;
  policy_decisions_json: string;
  outcome: "success" | "denied" | "error";
  created_at: string;
  hash_prev: string | null;
  hash_self: string;
}

export interface SqliteStoreOptions {
  root: string;
}

export class SqliteStore implements AtlasWikiStore {
  readonly root: string;
  readonly dbPath: string;
  private db: DatabaseSync | undefined;

  constructor(options: SqliteStoreOptions) {
    this.root = options.root;
    this.dbPath = join(this.root, "atlas-wiki.sqlite");
  }

  async init(): Promise<void> {
    ensureDataRoot(this.root);
    this.db = openDatabase(this.dbPath).db;
    applyMigrations(this.db);
    writeConfig(this.root);
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = undefined;
  }

  async ingestText(input: IngestInput): Promise<SourceRecord> {
    const db = this.requireDb();
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
      source_type: "file",
      title: input.title,
      uri: input.uri,
      owner: input.owner ? { id: input.owner, type: input.owner.startsWith("team:") ? "team" : "user" } : undefined,
      acl: defaultAccessPolicy(visibility, input.owner),
      sensitivity: input.sensitivity ?? (visibility === "public" ? "public" : "internal"),
      freshness: { updated_at: time, stale_after: input.stale_after },
      metadata: input.metadata
    };
    validateRecord(source);
    const chunks = chunkText(input.text);
    transaction(db, () => {
      this.upsertRecord(source);
      db.prepare("INSERT OR REPLACE INTO sources (id, source_type, title, uri, owner_id, content_hash, extracted_text_ref, stale_after, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        source.id,
        source.source_type,
        source.title,
        source.uri ?? null,
        source.owner?.id ?? null,
        source.content_hash,
        source.extracted_text_ref ?? null,
        source.freshness.stale_after ?? null,
        source.updated_at
      );
      db.prepare("DELETE FROM chunks WHERE source_id = ?").run(source.id);
      db.prepare("DELETE FROM chunks_fts WHERE source_id = ?").run(source.id);
      const insertChunk = db.prepare("INSERT INTO chunks (id, source_id, ordinal, text, text_hash, locator_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const insertFts = db.prepare("INSERT INTO chunks_fts (id, source_id, text) VALUES (?, ?, ?)");
      for (const chunk of chunks) {
        const id = stableId("chunk", { source_id: source.id, ordinal: chunk.ordinal, text_hash: chunk.text_hash });
        insertChunk.run(id, source.id, chunk.ordinal, chunk.text, chunk.text_hash, null, time);
        insertFts.run(id, source.id, chunk.text);
      }
      this.replaceAcl(source.id, source.acl);
      this.logAudit("ingest", { id: "service:ingest", type: "service" }, [{ id: source.id, schema: source.schema, kind: source.kind }], [{ record_ref: { id: source.id, schema: source.schema }, allowed: true, reason: "ingest_committed" }], "success");
    });
    return source;
  }

  async proposeClaim(input: { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined }): Promise<ProposalRecord> {
    return this.propose("claim", input);
  }

  async proposeChange(proposal_type: "update" | "deprecate" | "conflict", input: { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined }): Promise<ProposalRecord> {
    return this.propose(proposal_type, input);
  }

  private async propose(proposal_type: "claim" | "update" | "deprecate" | "conflict", input: { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined }): Promise<ProposalRecord> {
    const db = this.requireDb();
    const time = nowIso();
    const proposal: ProposalRecord = {
      schema: "atlas.wiki.proposal.v1",
      kind: "proposal",
      id: stableId("proposal", { type: proposal_type, text: input.text, source_id: input.source_id, by: input.requested_by.id }),
      status: "pending_approval",
      created_at: time,
      updated_at: time,
      revision: 1,
      content_hash: contentHash({ text: input.text, source_id: input.source_id }),
      proposal_type,
      target_ref: input.source_id ? { id: input.source_id, schema: "atlas.wiki.source.v1", kind: "source" } : undefined,
      payload: { text: input.text, owner: input.owner },
      requested_by: input.requested_by,
      approval_status: "pending"
    };
    transaction(db, () => {
      this.upsertRecord(proposal);
      db.prepare("INSERT OR REPLACE INTO proposals (id, proposal_type, target_id, approval_status, requested_by_json, payload_json) VALUES (?, ?, ?, ?, ?, ?)").run(
        proposal.id,
        proposal.proposal_type,
        input.source_id ?? null,
        proposal.approval_status,
        JSON.stringify(input.requested_by),
        JSON.stringify(proposal.payload)
      );
      this.logAudit(`proposal.${proposal_type}`, input.requested_by, [{ id: proposal.id, schema: proposal.schema, kind: proposal.kind }], [{ allowed: true, reason: "write_as_proposal" }], "success");
    });
    return proposal;
  }

  async search(query: string, actor: ActorRef, limit = 10): Promise<SearchResult[]> {
    const db = this.requireDb();
    const term = query.trim().replace(/"/g, "");
    let rows: SourceRow[] = [];
    if (term) {
      try {
        rows = db.prepare(
          `SELECT records.json, chunks.text, chunks.id AS chunk_id
           FROM chunks_fts
           JOIN chunks ON chunks.id = chunks_fts.id
           JOIN records ON records.id = chunks.source_id
           WHERE chunks_fts MATCH ?
           LIMIT ?`
        ).all(term, limit * 4) as unknown as SourceRow[];
      } catch {
        rows = [];
      }
    }
    if (rows.length === 0) {
      const fallback = db.prepare(
        `SELECT records.json, chunks.text, chunks.id AS chunk_id
         FROM chunks
         JOIN sources ON sources.id = chunks.source_id
         JOIN records ON records.id = sources.id
         WHERE lower(chunks.text) LIKE lower(?) OR lower(sources.title) LIKE lower(?)
         LIMIT ?`
      );
      for (const candidate of [query, ...query.split(/\s+/).filter(Boolean)]) {
        rows = fallback.all(`%${candidate}%`, `%${candidate}%`, limit * 4) as unknown as SourceRow[];
        if (rows.length > 0) break;
      }
    }
    const results: SearchResult[] = [];
    const decisions: PolicyDecision[] = [];
    for (const row of rows) {
      const source = JSON.parse(row.json) as SourceRecord;
      const decision = sourcePolicyDecision(source, actor);
      decisions.push({ record_ref: { id: source.id, schema: source.schema, kind: source.kind }, allowed: decision.allowed, reason: decision.reason });
      if (!decision.allowed) continue;
      const redacted = redactText(row.text, { id: source.id, schema: source.schema, kind: source.kind });
      results.push({ source, chunk_id: row.chunk_id, text: redacted.text, redacted: redacted.events.length > 0, score: 1 });
      if (results.length >= limit) break;
    }
    this.logAudit("search", actor, results.map((result) => ({ id: result.source.id, schema: result.source.schema, kind: result.source.kind })), decisions, "success");
    return results;
  }

  async fetch(id: string, actor: ActorRef): Promise<SourceRecord | undefined> {
    const row = this.requireDb().prepare("SELECT json FROM records WHERE id = ? AND deleted_at IS NULL").get(id) as { json: string } | undefined;
    if (!row) return undefined;
    const record = JSON.parse(row.json) as SourceRecord;
    const decision = sourcePolicyDecision(record, actor);
    this.logAudit("fetch", actor, [{ id, schema: record.schema, kind: record.kind }], [{ record_ref: { id, schema: record.schema }, allowed: decision.allowed, reason: decision.reason }], decision.allowed ? "success" : "denied");
    return decision.allowed ? record : undefined;
  }

  async contextPack(query: string, actor: ActorRef, limit = 10): Promise<ContextPackRecord> {
    const results = await this.search(query, actor, limit);
    const time = nowIso();
    const citations = [];
    const redactions = [];
    const freshness_markers = [];
    const conflict_markers = [];
    for (const result of results) {
      const ref = { id: result.source.id, schema: result.source.schema, kind: result.source.kind };
      if (result.redacted) redactions.push({ record_ref: ref, field: "text", reason: "search_result_redaction" });
      citations.push({ id: stableId("citation", { source: result.source.id, chunk: result.chunk_id }), source_ref: ref, title: result.source.title, uri: result.source.uri, quote: result.text.slice(0, 700), locator: result.source.locator });
      freshness_markers.push({ record_ref: ref, stale: isPastIso(result.source.freshness.stale_after), stale_after: result.source.freshness.stale_after, reason: isPastIso(result.source.freshness.stale_after) ? "stale_after_in_past" : "fresh" });
      const conflictScore = typeof result.source.metadata?.conflict_score === "number" ? result.source.metadata.conflict_score : 0;
      if (conflictScore > 0) conflict_markers.push({ record_ref: ref, conflict_score: conflictScore, reason: "source_metadata_conflict_score" });
    }
    const pack: ContextPackRecord = {
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
      citations,
      redactions,
      freshness_markers,
      conflict_markers,
      policy_decisions: results.map((result) => ({ record_ref: { id: result.source.id, schema: result.source.schema, kind: result.source.kind }, allowed: true, reason: "acl_allow" }))
    };
    this.logAudit("context_pack", actor, pack.included_refs, pack.policy_decisions, "success");
    return pack;
  }

  async validate(): Promise<{ ok: boolean; findings: string[] }> {
    const db = this.requireDb();
    const findings: string[] = [];
    const records = db.prepare("SELECT json FROM records WHERE deleted_at IS NULL").all() as Array<{ json: string }>;
    for (const row of records) {
      try {
        validateRecord(JSON.parse(row.json));
      } catch (error) {
        findings.push(`record_validation_failed:${String(error)}`);
      }
    }
    const auditRows = db.prepare("SELECT id, event_type, actor_json, record_refs_json, policy_decisions_json, outcome, created_at, hash_prev, hash_self FROM audit_events ORDER BY rowid").all() as unknown as AuditRow[];
    let prev: string | undefined;
    for (const row of auditRows) {
      if ((row.hash_prev ?? undefined) !== prev) findings.push(`audit_chain_prev_mismatch:${row.id}`);
      const expected = auditHash({
        id: row.id,
        event_type: row.event_type,
        actor: JSON.parse(row.actor_json) as ActorRef,
        record_refs: JSON.parse(row.record_refs_json) as Array<{ id: string; schema: string; kind?: string | undefined }>,
        policy_decisions: JSON.parse(row.policy_decisions_json) as PolicyDecision[],
        outcome: row.outcome,
        created_at: row.created_at,
        hash_prev: row.hash_prev ?? undefined
      });
      if (row.hash_self !== expected) findings.push(`audit_chain_hash_mismatch:${row.id}`);
      prev = row.hash_self;
    }
    return { ok: findings.length === 0, findings };
  }

  rebuildIndex(): void {
    const db = this.requireDb();
    db.exec("DELETE FROM chunks_fts;");
    db.exec("INSERT INTO chunks_fts (id, source_id, text) SELECT id, source_id, text FROM chunks;");
  }

  async backupCreate(): Promise<string> {
    return createSqliteBackup(this.requireDb(), this.dbPath, join(this.root, "exports", "sqlite-backups"));
  }

  backupVerify(): { ok: boolean; backups: string[]; invalid: string[] } {
    const dir = join(this.root, "exports", "sqlite-backups");
    const backups = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".bak")) : [];
    const invalid = backups.filter((file) => !verifySqliteBackup(join(dir, file)));
    return { ok: backups.length > 0 && invalid.length === 0, backups, invalid };
  }

  exportJsonShards(outDir = join(this.root, "exports", "json-shards")): string {
    const records = this.requireDb().prepare("SELECT json FROM records ORDER BY id").all() as Array<{ json: string }>;
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, "records.json");
    writeFileSync(out, JSON.stringify(records.map((row) => JSON.parse(row.json)), null, 2));
    return out;
  }

  private upsertRecord(record: { id: string; schema: string; kind: string; status: string; content_hash: string; revision: number; created_at: string; updated_at: string; created_by?: unknown; updated_by?: unknown }): void {
    this.requireDb().prepare("INSERT OR REPLACE INTO records (id, schema, kind, status, json, content_hash, revision, created_at, updated_at, created_by, updated_by, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)").run(
      record.id,
      record.schema,
      record.kind,
      record.status,
      JSON.stringify(record),
      record.content_hash,
      record.revision,
      record.created_at,
      record.updated_at,
      record.created_by ? JSON.stringify(record.created_by) : null,
      record.updated_by ? JSON.stringify(record.updated_by) : null
    );
  }

  private replaceAcl(record_id: string, acl: SourceRecord["acl"]): void {
    const db = this.requireDb();
    db.prepare("DELETE FROM record_acl WHERE record_id = ?").run(record_id);
    const insert = db.prepare("INSERT INTO record_acl (record_id, principal_type, principal_id, effect, permission) VALUES (?, ?, ?, ?, ?)");
    for (const grant of acl.grants) insert.run(record_id, grant.principal_type, grant.principal_id, grant.effect, grant.permission);
  }

  private logAudit(event_type: string, actor: ActorRef, record_refs: Array<{ id: string; schema: string; kind?: string | undefined }>, policy_decisions: PolicyDecision[], outcome: "success" | "denied" | "error"): void {
    const db = this.requireDb();
    const time = nowIso();
    const prev = db.prepare("SELECT hash_self FROM audit_events ORDER BY rowid DESC LIMIT 1").get() as { hash_self: string } | undefined;
    const id = stableId("audit", { event_type, actor, time, record_refs, n: Math.random() });
    const hash_self = auditHash({ id, event_type, actor, record_refs, policy_decisions, outcome, created_at: time, hash_prev: prev?.hash_self });
    db.prepare("INSERT INTO audit_events (id, event_type, actor_json, request_id, record_refs_json, policy_decisions_json, outcome, created_at, hash_prev, hash_self) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      id,
      event_type,
      JSON.stringify(actor),
      stableId("request", { event_type, actor, time }),
      JSON.stringify(record_refs),
      JSON.stringify(policy_decisions),
      outcome,
      time,
      prev?.hash_self ?? null,
      hash_self
    );
  }

  private requireDb(): DatabaseSync {
    if (!this.db) {
      this.db = openDatabase(this.dbPath).db;
      applyMigrations(this.db);
    }
    return this.db;
  }
}

export function ensureDataRoot(root: string): void {
  for (const dir of ["", "blobs/sources", "blobs/attachments", "blobs/extracted-text", "blobs/thumbnails", "cache/embeddings", "cache/retrieval", "cache/connector-cursors", "exports/json-shards", "exports/ndjson", "exports/sqlite-backups", "reports/validation", "reports/security", "reports/freshness", "reports/conflicts", "reports/audit", "tmp"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
}

function writeConfig(root: string): void {
  const config = join(root, "config.json");
  if (!existsSync(config)) writeFileSync(config, JSON.stringify({ schema: "atlas.wiki.config.v1", created_at: nowIso(), database: "atlas-wiki.sqlite" }, null, 2));
}

function auditHash(payload: { id: string; event_type: string; actor: ActorRef; record_refs: Array<{ id: string; schema: string; kind?: string | undefined }>; policy_decisions: PolicyDecision[]; outcome: "success" | "denied" | "error"; created_at: string; hash_prev?: string | undefined }): string {
  return sha256(JSON.stringify(payload));
}
