import type { ActorRef, AtlasRecord, ContextPackRecord, PolicyDecision, ProposalRecord, RecordRef, RedactionEvent, SourceRecord, StructuredObjectRecord } from "../core/records/index.js";

export interface IngestInput {
  title: string;
  text: string;
  uri?: string | undefined;
  owner?: string | undefined;
  visibility?: "public" | "internal" | "private" | undefined;
  sensitivity?: "public" | "internal" | "confidential" | "restricted" | "secret" | undefined;
  stale_after?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SearchResult {
  source: SourceRecord;
  chunk_id: string;
  text: string;
  redacted: boolean;
  redactions?: RedactionEvent[] | undefined;
  score: number;
}

export interface StructuredIngestInput extends IngestInput {
  schemas?: string[] | undefined;
  mode?: "proposal" | "commit" | undefined;
  actor?: ActorRef | undefined;
  trusted?: boolean | undefined;
}

export interface StructuredIngestResult {
  source: SourceRecord;
  structuredObjects: StructuredObjectRecord[];
  proposals: ProposalRecord[];
  warnings: string[];
}

export interface ProposeClaimInput { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined; }
export type ProposalType = "update" | "deprecate" | "conflict";
export interface ProposeChangeInput { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined; }
export interface WriteOptions { expectedRevision?: number | undefined; actor?: ActorRef | undefined; }
export interface WriteResult { record: AtlasRecord; created: boolean; previousRevision?: number | undefined; revision: number; }
export interface ValidationReport { ok: boolean; findings: string[]; }
export interface MigrationReport { ok: boolean; user_version?: number | undefined; applied_count?: number | undefined; pending_count?: number | undefined; entries?: unknown[] | undefined; backend?: string | undefined; }
export interface BackupVerifyResult { ok: boolean; backups: string[]; invalid: string[]; }

export interface AtlasWikiStore {
  init(): Promise<void>;
  close(): Promise<void>;
  ingestText(input: IngestInput): Promise<SourceRecord>;
  ingestStructured(input: StructuredIngestInput): Promise<StructuredIngestResult>;
  search(query: string, actor: ActorRef, limit?: number): Promise<SearchResult[]>;
  listSources(query: string | undefined, actor: ActorRef, limit?: number): Promise<SourceRecord[]>;
  fetch(id: string, actor: ActorRef): Promise<AtlasRecord | undefined>;
  validateAccess(id: string, actor: ActorRef): Promise<boolean>;
  contextPack(query: string, actor: ActorRef, limit?: number): Promise<ContextPackRecord>;
  proposeClaim(input: ProposeClaimInput): Promise<ProposalRecord>;
  proposeChange(type: ProposalType, input: ProposeChangeInput): Promise<ProposalRecord>;
  upsertRecord(record: AtlasRecord, options?: WriteOptions): Promise<WriteResult>;
  validate(): Promise<ValidationReport>;
  migrationReport(): MigrationReport | Promise<MigrationReport>;
  backupCreate?(): Promise<string>;
  backupVerify?(): BackupVerifyResult;
  backupRestore?(backupPath: string, overwrite?: boolean): string;
  rebuildIndex?(): void;
  exportJsonShards?(outDir?: string): string;
  audit(event_type: string, actor: ActorRef, refs: RecordRef[], decisions: PolicyDecision[], outcome: "success" | "denied" | "error"): void | Promise<void>;
}
