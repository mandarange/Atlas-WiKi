export type RecordStatus = "draft" | "active" | "pending_approval" | "deprecated" | "rejected" | "deleted";
export type SensitivityLabel = "public" | "internal" | "confidential" | "restricted" | "secret";
export type Visibility = "public" | "internal" | "private";
export type PrincipalType = "user" | "team" | "role" | "everyone" | "authenticated";
export type Permission = "read" | "write" | "admin";
export interface ActorRef { id: string; type: "user" | "service" | "anonymous"; groups?: string[] | undefined; roles?: string[] | undefined; }
export interface OwnerRef { id: string; type: "user" | "team" | "organization"; }
export interface ConnectorRef { id: string; type: string; external_id?: string | undefined; }
export interface RecordRef { id: string; schema: string; kind?: string | undefined; }
export interface SourceLocator { path?: string | undefined; line_start?: number | undefined; line_end?: number | undefined; byte_start?: number | undefined; byte_end?: number | undefined; }
export interface SourceRef extends RecordRef { locator?: SourceLocator | undefined; }
export interface EntityRef extends RecordRef { display_name?: string | undefined; }
export interface FreshnessPolicy { updated_at?: string | undefined; valid_from?: string | undefined; valid_until?: string | undefined; stale_after?: string | undefined; }
export interface TrustScore { authority_score: number; confidence_score: number; conflict_score: number; }
export interface AccessGrant { principal_type: PrincipalType; principal_id: string; permission: Permission; effect: "allow" | "deny"; }
export interface AccessPolicy { visibility: Visibility; grants: AccessGrant[]; }
export interface BaseRecord { schema: string; id: string; kind: string; status: RecordStatus; created_at: string; updated_at: string; created_by?: ActorRef | undefined; updated_by?: ActorRef | undefined; revision: number; content_hash: string; labels?: string[] | undefined; metadata?: Record<string, unknown> | undefined; }
export interface SourceRecord extends BaseRecord { schema: "atlas.wiki.source.v1"; kind: "source"; source_type: "file" | "page" | "message" | "email" | "ticket" | "meeting" | "database" | "manual" | "web"; title: string; uri?: string | undefined; connector?: ConnectorRef | undefined; owner?: OwnerRef | undefined; acl: AccessPolicy; sensitivity: SensitivityLabel; freshness: FreshnessPolicy; extracted_text_ref?: string | undefined; locator?: SourceLocator | undefined; }
export interface ChunkRecord extends BaseRecord { schema: "atlas.wiki.chunk.v1"; kind: "chunk"; source_ref: SourceRef; ordinal: number; text: string; text_hash: string; locator?: SourceLocator | undefined; acl: AccessPolicy; sensitivity: SensitivityLabel; }
export interface ClaimRecord extends BaseRecord { schema: "atlas.wiki.claim.v1"; kind: "claim"; claim_type: "fact" | "policy" | "procedure" | "decision" | "definition" | "faq" | "status" | "constraint"; text: string; normalized_text?: string | undefined; source_refs: SourceRef[]; entity_refs: EntityRef[]; owner?: OwnerRef | undefined; acl: AccessPolicy; sensitivity: SensitivityLabel; freshness: FreshnessPolicy; trust: TrustScore; }
export interface EntityRecord extends BaseRecord { schema: "atlas.wiki.entity.v1"; kind: "entity"; entity_type: "person" | "team" | "customer" | "product" | "project" | "system" | "policy" | "contract" | "vendor" | "location" | "topic"; display_name: string; aliases: string[]; owner?: OwnerRef | undefined; acl?: AccessPolicy | undefined; }
export interface RelationRecord extends BaseRecord { schema: "atlas.wiki.relation.v1"; kind: "relation"; relation_type: "supports" | "contradicts" | "supersedes" | "depends_on" | "owned_by" | "applies_to" | "mentions" | "derived_from"; from: RecordRef; to: RecordRef; evidence_refs: SourceRef[]; confidence: number; valid_from?: string | undefined; valid_until?: string | undefined; }
export interface PolicyScope { kind?: string | undefined; owner_id?: string | undefined; label?: string | undefined; }
export interface PolicyRule { id: string; effect: "allow" | "deny" | "redact" | "require_approval"; condition: Record<string, unknown>; }
export interface PolicyRecord extends BaseRecord { schema: "atlas.wiki.policy.v1"; kind: "policy"; policy_type: "access" | "redaction" | "retention" | "approval" | "freshness" | "connector"; scope: PolicyScope; rules: PolicyRule[]; enforcement: "advisory" | "blocking"; }
export interface ProposalRecord extends BaseRecord { schema: "atlas.wiki.proposal.v1"; kind: "proposal"; proposal_type: "claim" | "update" | "deprecate" | "conflict"; target_ref?: RecordRef | undefined; payload: Record<string, unknown>; requested_by: ActorRef; approval_status: "pending" | "approved" | "rejected"; }
export interface AccessGrantRecord extends BaseRecord { schema: "atlas.wiki.access-grant.v1"; kind: "access_grant"; record_ref: RecordRef; grant: AccessGrant; inherited_from?: RecordRef | undefined; }
export interface FreshnessRecord extends BaseRecord { schema: "atlas.wiki.freshness.v1"; kind: "freshness"; record_ref: RecordRef; policy: FreshnessPolicy; stale: boolean; checked_at: string; reason?: string | undefined; }
export interface ConflictRecord extends BaseRecord { schema: "atlas.wiki.conflict.v1"; kind: "conflict"; record_refs: RecordRef[]; conflict_type: "contradiction" | "duplicate" | "stale" | "ownership" | "policy"; severity: "low" | "medium" | "high" | "critical"; summary: string; resolution_status: "open" | "resolved" | "accepted"; }
export interface ApprovalRecord extends BaseRecord { schema: "atlas.wiki.approval.v1"; kind: "approval"; proposal_ref: RecordRef; approver: ActorRef; decision: "approved" | "rejected" | "needs_changes"; decided_at: string; comment?: string | undefined; }
export interface AuditRecord extends BaseRecord { schema: "atlas.wiki.audit.v1"; kind: "audit"; event_type: string; actor: ActorRef; record_refs: RecordRef[]; policy_decisions: PolicyDecision[]; outcome: "success" | "denied" | "error"; hash_prev?: string | undefined; hash_self: string; }
export interface ConnectorRecord extends BaseRecord { schema: "atlas.wiki.connector.v1"; kind: "connector"; connector_type: string; display_name: string; connector_status: "enabled" | "disabled" | "degraded"; cursor?: string | undefined; config_hash?: string | undefined; }
export interface OwnerRecord extends BaseRecord { schema: "atlas.wiki.owner.v1"; kind: "owner"; owner: OwnerRef; display_name: string; escalation_refs: OwnerRef[]; }
export interface RetentionRecord extends BaseRecord { schema: "atlas.wiki.retention.v1"; kind: "retention"; record_ref: RecordRef; retention_until?: string | undefined; legal_hold: boolean; action: "keep" | "redact" | "delete" | "archive"; }
export interface RedactionRecord extends BaseRecord { schema: "atlas.wiki.redaction.v1"; kind: "redaction"; record_ref: RecordRef; fields: string[]; reason: string; applied_at: string; reversible: boolean; }
export interface EmbeddingRecord extends BaseRecord { schema: "atlas.wiki.embedding.v1"; kind: "embedding"; record_ref: RecordRef; provider: string; model: string; dimensions: number; vector_hash: string; cache_key: string; }
export interface IndexManifestRecord extends BaseRecord { schema: "atlas.wiki.index-manifest.v1"; kind: "index_manifest"; index_type: "fts" | "vector" | "graph"; version: string; record_count: number; built_at: string; }
export interface BackupRecord extends BaseRecord { schema: "atlas.wiki.backup.v1"; kind: "backup"; backup_type: "sqlite" | "json" | "ndjson"; path: string; size_bytes: number; verified: boolean; created_by: ActorRef; }
export interface MigrationRecord extends BaseRecord { schema: "atlas.wiki.migration.v1"; kind: "migration"; migration_id: string; applied_at: string; checksum: string; direction: "up" | "down"; }
export interface BlobRecord extends BaseRecord { schema: "atlas.wiki.blob.v1"; kind: "blob"; blob_type: "source" | "attachment" | "extracted_text" | "thumbnail"; path: string; media_type: string; size_bytes: number; sha256: string; }
export interface EvaluationRecord extends BaseRecord { schema: "atlas.wiki.evaluation.v1"; kind: "evaluation"; eval_type: "retrieval" | "redaction" | "freshness" | "conflict" | "permission"; dataset: string; metrics: Record<string, number>; passed: boolean; }
export interface Citation { id: string; source_ref: SourceRef; title: string; uri?: string | undefined; quote?: string | undefined; locator?: SourceLocator | undefined; }
export interface RedactionEvent { record_ref: RecordRef; field: string; reason: string; }
export interface FreshnessMarker { record_ref: RecordRef; stale: boolean; stale_after?: string | undefined; reason?: string | undefined; }
export interface ConflictMarker { record_ref: RecordRef; conflict_score: number; reason: string; }
export interface PolicyDecision { record_ref?: RecordRef; allowed: boolean; reason: string; }
export type QueryBackend = "fts5" | "like_fallback" | "none";
export interface ContextPackRecord extends BaseRecord { schema: "atlas.wiki.context-pack.v1"; kind: "context_pack"; query: string; actor: ActorRef; included_refs: RecordRef[]; citations: Citation[]; redactions: RedactionEvent[]; freshness_markers: FreshnessMarker[]; conflict_markers: ConflictMarker[]; policy_decisions: PolicyDecision[]; denied_count: number; redacted_count: number; stale_count: number; conflict_count: number; candidate_count: number; authorized_count: number; query_backend: QueryBackend; fallback_reason?: string | null | undefined; }
export type AtlasRecord =
  | SourceRecord
  | ChunkRecord
  | ClaimRecord
  | EntityRecord
  | RelationRecord
  | PolicyRecord
  | AccessGrantRecord
  | FreshnessRecord
  | ConflictRecord
  | ProposalRecord
  | ApprovalRecord
  | AuditRecord
  | ContextPackRecord
  | ConnectorRecord
  | OwnerRecord
  | RetentionRecord
  | RedactionRecord
  | EmbeddingRecord
  | IndexManifestRecord
  | BackupRecord
  | MigrationRecord
  | BlobRecord
  | EvaluationRecord;
