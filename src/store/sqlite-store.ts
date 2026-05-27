import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createSqliteBackup, restoreSqliteBackup, verifySqliteBackup } from "../db/backup.js";
import { openDatabase } from "../db/connection.js";
import { checkDatabaseIntegrity } from "../db/integrity.js";
import { applyMigrations, migrationDryRun } from "../db/migrations.js";
import { buildSafeFtsQuery } from "../db/query-builder.js";
import { transaction } from "../db/transaction.js";
import { contentHash, canonicalize, sha256 } from "../core/hash/index.js";
import { cryptoSafeId, stableId } from "../core/ids/index.js";
import { defaultAccessPolicy, policyResolver } from "../core/policy/index.js";
import type { ActorRef, AtlasRecord, ContextPackRecord, PolicyDecision, ProposalRecord, RedactionEvent, SourceRecord } from "../core/records/index.js";
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
  seq: number | null;
  event_type: string;
  actor_json: string;
  record_refs_json: string;
  policy_decisions_json: string;
  outcome: "success" | "denied" | "error";
  created_at: string;
  hash_prev: string | null;
  hash_self: string;
}

interface SearchDiagnostics {
  results: SearchResult[];
  policy_decisions: PolicyDecision[];
  candidate_count: number;
  authorized_count: number;
  denied_count: number;
  redacted_count: number;
  query_backend: "fts5" | "like_fallback" | "none";
  fallback_reason: string | null;
}

export interface SqliteStoreOptions {
  root: string;
  busyTimeoutMs?: number | undefined;
}

export class SqliteStore implements AtlasWikiStore {
  readonly root: string;
  readonly dbPath: string;
  private db: DatabaseSync | undefined;
  private busyTimeoutMs: number | undefined;

  constructor(options: SqliteStoreOptions) {
    this.root = options.root;
    this.dbPath = join(this.root, "atlas-wiki.sqlite");
    this.busyTimeoutMs = options.busyTimeoutMs;
  }

  async init(): Promise<void> {
    ensureDataRoot(this.root);
    this.db = openDatabase(this.dbPath, { busyTimeoutMs: this.busyTimeoutMs }).db;
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
      db.prepare(
        `INSERT INTO sources (id, source_type, title, uri, owner_id, content_hash, extracted_text_ref, stale_after, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source_type = excluded.source_type,
           title = excluded.title,
           uri = excluded.uri,
           owner_id = excluded.owner_id,
           content_hash = excluded.content_hash,
           extracted_text_ref = excluded.extracted_text_ref,
           stale_after = excluded.stale_after,
           updated_at = excluded.updated_at`
      ).run(
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
    validateRecord(proposal);
    transaction(db, () => {
      this.upsertRecord(proposal);
      db.prepare(
        `INSERT INTO proposals (id, proposal_type, target_id, approval_status, requested_by_json, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           proposal_type = excluded.proposal_type,
           target_id = excluded.target_id,
           approval_status = excluded.approval_status,
           requested_by_json = excluded.requested_by_json,
           payload_json = excluded.payload_json`
      ).run(proposal.id, proposal.proposal_type, input.source_id ?? null, proposal.approval_status, JSON.stringify(input.requested_by), JSON.stringify(proposal.payload));
      this.logAudit(`proposal.${proposal_type}`, input.requested_by, [{ id: proposal.id, schema: proposal.schema, kind: proposal.kind }], [{ allowed: true, reason: "write_as_proposal" }], "success");
    });
    return proposal;
  }

  async search(query: string, actor: ActorRef, limit = 10): Promise<SearchResult[]> {
    return this.searchWithDiagnostics(query, actor, limit).results;
  }

  async listSources(query: string | undefined, actor: ActorRef, limit = 50): Promise<SourceRecord[]> {
    if (query?.trim()) return (await this.search(query, actor, limit)).map((result) => result.source);
    const rows = this.requireDb().prepare(
      `SELECT records.json
       FROM sources
       JOIN records ON records.id = sources.id
       WHERE records.deleted_at IS NULL
       ORDER BY sources.updated_at DESC
       LIMIT ?`
    ).all(limit * 4) as Array<{ json: string }>;
    const sources: SourceRecord[] = [];
    const decisions: PolicyDecision[] = [];
    for (const row of rows) {
      const record = validateRecord(JSON.parse(row.json));
      if (record.kind !== "source") continue;
      const decision = policyResolver.canRead({ record, actor, purpose: "list_sources" });
      decisions.push({ record_ref: { id: record.id, schema: record.schema, kind: record.kind }, allowed: decision.allowed, reason: decision.reason });
      if (decision.allowed) sources.push(record);
      if (sources.length >= limit) break;
    }
    this.logAudit("list_sources", actor, sources.map((source) => ({ id: source.id, schema: source.schema, kind: source.kind })), decisions, "success");
    return sources;
  }

  async fetch(id: string, actor: ActorRef): Promise<AtlasRecord | undefined> {
    const row = this.requireDb().prepare("SELECT json FROM records WHERE id = ? AND deleted_at IS NULL").get(id) as { json: string } | undefined;
    if (!row) return undefined;
    const record = validateRecord(JSON.parse(row.json));
    const decision = policyResolver.canRead({ record, actor, purpose: "fetch" });
    this.logAudit("fetch", actor, [{ id, schema: record.schema, kind: record.kind }], [{ record_ref: { id, schema: record.schema, kind: record.kind }, allowed: decision.allowed, reason: decision.reason }], decision.allowed ? "success" : "denied");
    return decision.allowed ? record : undefined;
  }

  async validateAccess(id: string, actor: ActorRef): Promise<boolean> {
    const row = this.requireDb().prepare("SELECT json FROM records WHERE id = ? AND deleted_at IS NULL").get(id) as { json: string } | undefined;
    if (!row) {
      this.logAudit("validate_access", actor, [{ id, schema: "unknown" }], [{ record_ref: { id, schema: "unknown" }, allowed: false, reason: "record_not_found" }], "denied");
      return false;
    }
    const record = validateRecord(JSON.parse(row.json));
    const decision = policyResolver.canRead({ record, actor, purpose: "validate_access" });
    this.logAudit("validate_access", actor, [{ id, schema: record.schema, kind: record.kind }], [{ record_ref: { id, schema: record.schema, kind: record.kind }, allowed: decision.allowed, reason: decision.reason }], decision.allowed ? "success" : "denied");
    return decision.allowed;
  }

  async contextPack(query: string, actor: ActorRef, limit = 10): Promise<ContextPackRecord> {
    const diagnostics = this.searchWithDiagnostics(query, actor, limit);
    const results = diagnostics.results;
    const time = nowIso();
    const citations = [];
    const redactions: RedactionEvent[] = [];
    const freshness_markers = [];
    const conflict_markers = [];
    for (const result of results) {
      const ref = { id: result.source.id, schema: result.source.schema, kind: result.source.kind };
      redactions.push(...(result.redactions ?? []));
      citations.push({ id: stableId("citation", { source: result.source.id, chunk: result.chunk_id }), source_ref: ref, title: result.source.title, uri: result.source.uri, quote: result.text.slice(0, 700), locator: result.source.locator });
      const stale = isPastIso(result.source.freshness.stale_after);
      freshness_markers.push({ record_ref: ref, stale, stale_after: result.source.freshness.stale_after, reason: stale ? "stale_after_in_past" : "fresh" });
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
      policy_decisions: diagnostics.policy_decisions,
      denied_count: diagnostics.denied_count,
      redacted_count: redactions.length,
      stale_count: freshness_markers.filter((marker) => marker.stale).length,
      conflict_count: conflict_markers.length,
      candidate_count: diagnostics.candidate_count,
      authorized_count: diagnostics.authorized_count,
      query_backend: diagnostics.query_backend,
      fallback_reason: diagnostics.fallback_reason,
      metadata: {
        denied_count: diagnostics.denied_count,
        redacted_count: redactions.length,
        stale_count: freshness_markers.filter((marker) => marker.stale).length,
        conflict_count: conflict_markers.length,
        candidate_count: diagnostics.candidate_count,
        authorized_count: diagnostics.authorized_count,
        query_backend: diagnostics.query_backend,
        fallback_reason: diagnostics.fallback_reason
      }
    };
    validateRecord(pack);
    this.logAudit("context_pack", actor, pack.included_refs, pack.policy_decisions, "success");
    return pack;
  }

  async validate(): Promise<{ ok: boolean; findings: string[] }> {
    const db = this.requireDb();
    const findings: string[] = [];
    findings.push(...checkDatabaseIntegrity(db).findings);
    const records = db.prepare("SELECT json FROM records WHERE deleted_at IS NULL").all() as Array<{ json: string }>;
    for (const row of records) {
      try {
        validateRecord(JSON.parse(row.json));
      } catch (error) {
        findings.push(`record_validation_failed:${String(error)}`);
      }
    }
    const auditRows = db.prepare("SELECT id, seq, event_type, actor_json, record_refs_json, policy_decisions_json, outcome, created_at, hash_prev, hash_self FROM audit_events ORDER BY COALESCE(seq, rowid)").all() as unknown as AuditRow[];
    let prev: string | undefined;
    const seen = new Set<string>();
    const seenSeq = new Set<number>();
    let expectedSeq = 1;
    let lastRow: AuditRow | undefined;
    for (const row of auditRows) {
      if (seen.has(row.id)) findings.push(`audit_chain_replay_duplicate:${row.id}`);
      seen.add(row.id);
      if (row.seq == null) findings.push(`audit_chain_seq_missing:${row.id}`);
      else {
        if (seenSeq.has(row.seq)) findings.push(`audit_chain_seq_duplicate:${row.id}`);
        seenSeq.add(row.seq);
        if (row.seq !== expectedSeq) findings.push(`audit_chain_seq_mismatch:${row.id}`);
      }
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
      expectedSeq += 1;
      lastRow = row;
    }
    const head = db.prepare("SELECT last_seq, event_id, hash_self FROM audit_head WHERE singleton_id = 1").get() as { last_seq: number; event_id: string; hash_self: string } | undefined;
    if (lastRow) {
      if (!head) findings.push("audit_head_missing");
      else if (head.last_seq !== lastRow.seq || head.event_id !== lastRow.id || head.hash_self !== lastRow.hash_self) findings.push("audit_head_mismatch");
    } else if (head) {
      findings.push("audit_head_orphan");
    }
    return { ok: findings.length === 0, findings };
  }

  migrationReport() {
    return migrationDryRun(this.requireDb());
  }

  rebuildIndex(): void {
    const db = this.requireDb();
    transaction(db, () => {
      db.exec("DELETE FROM chunks_fts;");
      db.exec("INSERT INTO chunks_fts (id, source_id, text) SELECT id, source_id, text FROM chunks;");
      this.logAudit("index.rebuild", { id: "service:index", type: "service" }, [], [{ allowed: true, reason: "fts_rebuilt" }], "success");
    });
  }

  async backupCreate(): Promise<string> {
    const path = await createSqliteBackup(this.requireDb(), this.dbPath, join(this.root, "exports", "sqlite-backups"));
    this.logAudit("backup.create", { id: "service:backup", type: "service" }, [], [{ allowed: true, reason: "sqlite_backup_created" }], "success");
    return path;
  }

  backupVerify(): { ok: boolean; backups: string[]; invalid: string[] } {
    const dir = join(this.root, "exports", "sqlite-backups");
    const backups = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".bak")) : [];
    const invalid = backups.filter((file) => !verifySqliteBackup(join(dir, file)));
    this.logAudit("backup.verify", { id: "service:backup", type: "service" }, [], [{ allowed: invalid.length === 0, reason: "sqlite_backup_verify" }], invalid.length === 0 ? "success" : "error");
    return { ok: backups.length > 0 && invalid.length === 0, backups, invalid };
  }

  backupRestore(backupPath: string, overwrite = false): string {
    this.closeSync();
    const restored = restoreSqliteBackup({ backupPath, dbPath: this.dbPath, overwrite });
    this.db = openDatabase(this.dbPath, { busyTimeoutMs: this.busyTimeoutMs }).db;
    applyMigrations(this.db);
    this.logAudit("backup.restore", { id: "service:backup", type: "service" }, [], [{ allowed: true, reason: "sqlite_backup_restored" }], "success");
    return restored;
  }

  exportJsonShards(outDir = join(this.root, "exports", "json-shards")): string {
    const records = this.requireDb().prepare("SELECT json FROM records ORDER BY id").all() as Array<{ json: string }>;
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, "records.json");
    writeFileSync(out, JSON.stringify(records.map((row) => JSON.parse(row.json)), null, 2));
    this.logAudit("export.json_shards", { id: "service:export", type: "service" }, [], [{ allowed: true, reason: "json_shards_exported" }], "success");
    return out;
  }

  audit(event_type: string, actor: ActorRef, record_refs: Array<{ id: string; schema: string; kind?: string | undefined }>, policy_decisions: PolicyDecision[], outcome: "success" | "denied" | "error"): void {
    this.logAudit(event_type, actor, record_refs, policy_decisions, outcome);
  }

  private searchWithDiagnostics(query: string, actor: ActorRef, limit: number): SearchDiagnostics {
    const db = this.requireDb();
    const safeQuery = buildSafeFtsQuery(query);
    let rows: SourceRow[] = [];
    let queryBackend: "fts5" | "like_fallback" | "none" = "none";
    let fallbackReason = safeQuery.fallbackReason;
    if (!query.trim()) {
      fallbackReason = "empty_query_denied";
    } else if (safeQuery.query) {
      try {
        rows = db.prepare(
          `SELECT records.json, chunks.text, chunks.id AS chunk_id
           FROM chunks_fts
           JOIN chunks ON chunks.id = chunks_fts.id
           JOIN records ON records.id = chunks.source_id
           WHERE chunks_fts MATCH ?
           LIMIT ?`
        ).all(safeQuery.query, limit * 4) as unknown as SourceRow[];
        queryBackend = "fts5";
      } catch (error) {
        rows = [];
        fallbackReason = "fts_error:" + (error instanceof Error ? error.message : String(error));
      }
    }
    if (rows.length === 0 && query.trim()) {
      rows = this.likeFallbackRows(query, limit);
      queryBackend = rows.length > 0 ? "like_fallback" : "none";
      fallbackReason ??= safeQuery.query ? "fts_no_results" : "no_safe_fts_query";
    }

    const results: SearchResult[] = [];
    const decisions: PolicyDecision[] = [];
    let denied = 0;
    let redacted = 0;
    for (const row of rows) {
      const source = validateRecord(JSON.parse(row.json)) as SourceRecord;
      const decision = policyResolver.canRead({ record: source, actor, purpose: "search" });
      decisions.push({ record_ref: { id: source.id, schema: source.schema, kind: source.kind }, allowed: decision.allowed, reason: decision.reason });
      if (!decision.allowed) {
        denied += 1;
        continue;
      }
      const ref = { id: source.id, schema: source.schema, kind: source.kind };
      const redaction = redactText(row.text, ref, { field: "text", sensitivity: source.sensitivity });
      redacted += redaction.events.length;
      results.push({ source, chunk_id: row.chunk_id, text: redaction.text, redacted: redaction.events.length > 0, redactions: redaction.events, score: 1 });
      if (results.length >= limit) break;
    }
    this.logAudit("search", actor, results.map((result) => ({ id: result.source.id, schema: result.source.schema, kind: result.source.kind })), decisions, "success");
    return {
      results,
      policy_decisions: decisions,
      candidate_count: rows.length,
      authorized_count: results.length,
      denied_count: denied,
      redacted_count: redacted,
      query_backend: queryBackend,
      fallback_reason: fallbackReason
    };
  }

  private likeFallbackRows(query: string, limit: number): SourceRow[] {
    const db = this.requireDb();
    const fallback = db.prepare(
      `SELECT records.json, chunks.text, chunks.id AS chunk_id
       FROM chunks
       JOIN sources ON sources.id = chunks.source_id
       JOIN records ON records.id = sources.id
       WHERE lower(chunks.text) LIKE lower(?) OR lower(sources.title) LIKE lower(?)
       LIMIT ?`
    );
    const candidates = query.trim() ? [query, ...query.split(/\s+/).filter(Boolean)] : [""];
    for (const candidate of candidates) {
      const rows = fallback.all(`%${candidate}%`, `%${candidate}%`, limit * 4) as unknown as SourceRow[];
      if (rows.length > 0) return rows;
    }
    return [];
  }

  private upsertRecord(record: AtlasRecord): void {
    this.requireDb().prepare(
      `INSERT INTO records (id, schema, kind, status, json, content_hash, revision, created_at, updated_at, created_by, updated_by, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         schema = excluded.schema,
         kind = excluded.kind,
         status = excluded.status,
         json = excluded.json,
         content_hash = excluded.content_hash,
         revision = excluded.revision,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         deleted_at = NULL`
    ).run(
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
    const write = () => {
      const time = nowIso();
      const prev = db.prepare("SELECT last_seq, hash_self FROM audit_head WHERE singleton_id = 1").get() as { last_seq: number; hash_self: string } | undefined;
      const fallbackPrev = prev ?? db.prepare("SELECT seq AS last_seq, hash_self FROM audit_events ORDER BY COALESCE(seq, rowid) DESC LIMIT 1").get() as { last_seq: number | null; hash_self: string } | undefined;
      const seq = (fallbackPrev?.last_seq ?? 0) + 1;
      const id = cryptoSafeId("audit");
      const hash_self = auditHash({ id, event_type, actor, record_refs, policy_decisions, outcome, created_at: time, hash_prev: fallbackPrev?.hash_self });
      db.prepare("INSERT INTO audit_events (id, seq, event_type, actor_json, request_id, record_refs_json, policy_decisions_json, outcome, created_at, hash_prev, hash_self) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        id,
        seq,
        event_type,
        JSON.stringify(actor),
        cryptoSafeId("request"),
        JSON.stringify(record_refs),
        JSON.stringify(policy_decisions),
        outcome,
        time,
        fallbackPrev?.hash_self ?? null,
        hash_self
      );
      db.prepare(
        `INSERT INTO audit_head (singleton_id, last_seq, event_id, hash_self, updated_at)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(singleton_id) DO UPDATE SET
           last_seq = excluded.last_seq,
           event_id = excluded.event_id,
           hash_self = excluded.hash_self,
           updated_at = excluded.updated_at`
      ).run(seq, id, hash_self, time);
    };
    if (isInTransaction(db)) write();
    else transaction(db, write);
  }

  private requireDb(): DatabaseSync {
    if (!this.db) {
      this.db = openDatabase(this.dbPath, { busyTimeoutMs: this.busyTimeoutMs }).db;
      applyMigrations(this.db);
    }
    return this.db;
  }

  private closeSync(): void {
    this.db?.close();
    this.db = undefined;
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
  return sha256(canonicalize(payload));
}

function isInTransaction(db: DatabaseSync): boolean {
  return Boolean((db as DatabaseSync & { isTransaction?: boolean }).isTransaction);
}
