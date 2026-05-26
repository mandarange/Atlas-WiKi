export interface JsonSchema {
  $id: string;
  type: "object";
  required: string[];
  properties: Record<string, unknown>;
  additionalProperties?: boolean;
}

export interface SchemaDescriptor {
  name: string;
  schemaId: string;
  kind: string;
  projection: string;
  redactionFields: string[];
  aclSource: "own" | "source" | "owner" | "policy" | "none";
}

const baseProperties = {
  schema: { type: "string" },
  id: { type: "string" },
  kind: { type: "string" },
  status: { enum: ["draft", "active", "pending_approval", "deprecated", "rejected", "deleted"] },
  created_at: { type: "string", format: "date-time" },
  updated_at: { type: "string", format: "date-time" },
  revision: { type: "number" },
  content_hash: { type: "string" },
  labels: { type: "array" },
  metadata: { type: "object" }
};

const descriptors = [
  ["BaseRecord", "atlas.wiki.base.v1", "base", "records", ["metadata"], "none"],
  ["SourceRecord", "atlas.wiki.source.v1", "source", "records,sources,record_acl", ["uri", "metadata", "extracted_text_ref"], "own"],
  ["ChunkRecord", "atlas.wiki.chunk.v1", "chunk", "records,chunks,chunks_fts", ["text", "locator"], "source"],
  ["ClaimRecord", "atlas.wiki.claim.v1", "claim", "records,claims", ["text", "normalized_text"], "own"],
  ["EntityRecord", "atlas.wiki.entity.v1", "entity", "records,entities", ["aliases", "metadata"], "owner"],
  ["RelationRecord", "atlas.wiki.relation.v1", "relation", "records,relations", ["metadata"], "source"],
  ["PolicyRecord", "atlas.wiki.policy.v1", "policy", "records,policies", ["rules"], "policy"],
  ["AccessGrantRecord", "atlas.wiki.access-grant.v1", "access_grant", "records,record_acl", ["grant"], "policy"],
  ["FreshnessRecord", "atlas.wiki.freshness.v1", "freshness", "records,freshness_markers", ["reason"], "source"],
  ["ConflictRecord", "atlas.wiki.conflict.v1", "conflict", "records,conflicts", ["summary"], "source"],
  ["ProposalRecord", "atlas.wiki.proposal.v1", "proposal", "records,proposals", ["payload"], "policy"],
  ["ApprovalRecord", "atlas.wiki.approval.v1", "approval", "records,approvals", ["comment"], "policy"],
  ["AuditRecord", "atlas.wiki.audit.v1", "audit", "records,audit_events", ["actor", "policy_decisions"], "policy"],
  ["ContextPackRecord", "atlas.wiki.context-pack.v1", "context_pack", "records,context_packs", ["citations", "redactions"], "policy"],
  ["ConnectorRecord", "atlas.wiki.connector.v1", "connector", "records,connectors", ["cursor", "config_hash"], "policy"],
  ["OwnerRecord", "atlas.wiki.owner.v1", "owner", "records,owners", ["escalation_refs"], "owner"],
  ["RetentionRecord", "atlas.wiki.retention.v1", "retention", "records,retention", ["legal_hold"], "policy"],
  ["RedactionRecord", "atlas.wiki.redaction.v1", "redaction", "records,redactions", ["fields", "reason"], "policy"],
  ["EmbeddingRecord", "atlas.wiki.embedding.v1", "embedding", "records,embeddings", ["cache_key"], "source"],
  ["IndexManifestRecord", "atlas.wiki.index-manifest.v1", "index_manifest", "records,index_manifests", ["metadata"], "policy"],
  ["BackupRecord", "atlas.wiki.backup.v1", "backup", "records,backups", ["path"], "policy"],
  ["MigrationRecord", "atlas.wiki.migration.v1", "migration", "records,migrations", ["checksum"], "policy"],
  ["BlobRecord", "atlas.wiki.blob.v1", "blob", "records,blobs", ["path"], "source"],
  ["EvaluationRecord", "atlas.wiki.evaluation.v1", "evaluation", "records,evaluations", ["metrics", "dataset"], "policy"]
] as const satisfies readonly (readonly [string, string, string, string, readonly string[], SchemaDescriptor["aclSource"]])[];

export const recordSchemaDescriptors: readonly SchemaDescriptor[] = descriptors.map(([name, schemaId, kind, projection, redactionFields, aclSource]) => ({
  name,
  schemaId,
  kind,
  projection,
  redactionFields: [...redactionFields],
  aclSource
}));

function objectSchema($id: string, required: string[], properties: Record<string, unknown>): JsonSchema {
  return {
    $id,
    type: "object",
    required,
    properties: { ...baseProperties, ...properties },
    additionalProperties: true
  };
}

const baseRequired = ["schema", "id", "kind", "status", "created_at", "updated_at", "revision", "content_hash"];

export const baseRecordSchema = objectSchema("atlas.wiki.base.v1", baseRequired, {});
export const sourceRecordSchema = objectSchema("atlas.wiki.source.v1", [...baseRequired, "source_type", "title", "acl", "sensitivity", "freshness"], { source_type: { type: "string" }, title: { type: "string" }, acl: { type: "object" }, sensitivity: { type: "string" }, freshness: { type: "object" } });
export const chunkRecordSchema = objectSchema("atlas.wiki.chunk.v1", [...baseRequired, "source_ref", "ordinal", "text", "text_hash", "acl", "sensitivity"], { source_ref: { type: "object" }, ordinal: { type: "number" }, text: { type: "string" }, text_hash: { type: "string" }, acl: { type: "object" }, sensitivity: { type: "string" } });
export const claimRecordSchema = objectSchema("atlas.wiki.claim.v1", [...baseRequired, "claim_type", "text", "source_refs", "entity_refs", "acl", "sensitivity", "freshness", "trust"], { claim_type: { type: "string" }, text: { type: "string" }, source_refs: { type: "array" }, entity_refs: { type: "array" }, acl: { type: "object" }, sensitivity: { type: "string" }, freshness: { type: "object" }, trust: { type: "object" } });
export const entityRecordSchema = objectSchema("atlas.wiki.entity.v1", [...baseRequired, "entity_type", "display_name", "aliases"], { entity_type: { type: "string" }, display_name: { type: "string" }, aliases: { type: "array" } });
export const relationRecordSchema = objectSchema("atlas.wiki.relation.v1", [...baseRequired, "relation_type", "from", "to", "evidence_refs", "confidence"], { relation_type: { type: "string" }, from: { type: "object" }, to: { type: "object" }, evidence_refs: { type: "array" }, confidence: { type: "number" } });
export const policyRecordSchema = objectSchema("atlas.wiki.policy.v1", [...baseRequired, "policy_type", "scope", "rules", "enforcement"], { policy_type: { type: "string" }, scope: { type: "object" }, rules: { type: "array" }, enforcement: { type: "string" } });
export const accessGrantRecordSchema = objectSchema("atlas.wiki.access-grant.v1", [...baseRequired, "record_ref", "grant"], { record_ref: { type: "object" }, grant: { type: "object" } });
export const freshnessRecordSchema = objectSchema("atlas.wiki.freshness.v1", [...baseRequired, "record_ref", "policy", "stale", "checked_at"], { record_ref: { type: "object" }, policy: { type: "object" }, stale: { type: "boolean" }, checked_at: { type: "string" } });
export const conflictRecordSchema = objectSchema("atlas.wiki.conflict.v1", [...baseRequired, "record_refs", "conflict_type", "severity", "summary", "resolution_status"], { record_refs: { type: "array" }, conflict_type: { type: "string" }, severity: { type: "string" }, summary: { type: "string" }, resolution_status: { type: "string" } });
export const proposalRecordSchema = objectSchema("atlas.wiki.proposal.v1", [...baseRequired, "proposal_type", "payload", "requested_by", "approval_status"], { proposal_type: { type: "string" }, payload: { type: "object" }, requested_by: { type: "object" }, approval_status: { type: "string" } });
export const approvalRecordSchema = objectSchema("atlas.wiki.approval.v1", [...baseRequired, "proposal_ref", "approver", "decision", "decided_at"], { proposal_ref: { type: "object" }, approver: { type: "object" }, decision: { type: "string" }, decided_at: { type: "string" } });
export const auditRecordSchema = objectSchema("atlas.wiki.audit.v1", [...baseRequired, "event_type", "actor", "record_refs", "policy_decisions", "outcome", "hash_self"], { event_type: { type: "string" }, actor: { type: "object" }, record_refs: { type: "array" }, policy_decisions: { type: "array" }, outcome: { type: "string" }, hash_self: { type: "string" } });
export const contextPackRecordSchema = objectSchema("atlas.wiki.context-pack.v1", [...baseRequired, "query", "actor", "included_refs", "citations", "redactions", "freshness_markers", "conflict_markers", "policy_decisions", "denied_count", "redacted_count", "stale_count", "conflict_count", "candidate_count", "authorized_count", "query_backend"], { query: { type: "string" }, actor: { type: "object" }, included_refs: { type: "array" }, citations: { type: "array" }, redactions: { type: "array" }, freshness_markers: { type: "array" }, conflict_markers: { type: "array" }, policy_decisions: { type: "array" }, denied_count: { type: "number" }, redacted_count: { type: "number" }, stale_count: { type: "number" }, conflict_count: { type: "number" }, candidate_count: { type: "number" }, authorized_count: { type: "number" }, query_backend: { type: "string" }, fallback_reason: { type: "string" } });
export const connectorRecordSchema = objectSchema("atlas.wiki.connector.v1", [...baseRequired, "connector_type", "display_name", "connector_status"], { connector_type: { type: "string" }, display_name: { type: "string" }, connector_status: { type: "string" } });
export const ownerRecordSchema = objectSchema("atlas.wiki.owner.v1", [...baseRequired, "owner", "display_name", "escalation_refs"], { owner: { type: "object" }, display_name: { type: "string" }, escalation_refs: { type: "array" } });
export const retentionRecordSchema = objectSchema("atlas.wiki.retention.v1", [...baseRequired, "record_ref", "legal_hold", "action"], { record_ref: { type: "object" }, legal_hold: { type: "boolean" }, action: { type: "string" } });
export const redactionRecordSchema = objectSchema("atlas.wiki.redaction.v1", [...baseRequired, "record_ref", "fields", "reason", "applied_at", "reversible"], { record_ref: { type: "object" }, fields: { type: "array" }, reason: { type: "string" }, applied_at: { type: "string" }, reversible: { type: "boolean" } });
export const embeddingRecordSchema = objectSchema("atlas.wiki.embedding.v1", [...baseRequired, "record_ref", "provider", "model", "dimensions", "vector_hash", "cache_key"], { record_ref: { type: "object" }, provider: { type: "string" }, model: { type: "string" }, dimensions: { type: "number" }, vector_hash: { type: "string" }, cache_key: { type: "string" } });
export const indexManifestRecordSchema = objectSchema("atlas.wiki.index-manifest.v1", [...baseRequired, "index_type", "version", "record_count", "built_at"], { index_type: { type: "string" }, version: { type: "string" }, record_count: { type: "number" }, built_at: { type: "string" } });
export const backupRecordSchema = objectSchema("atlas.wiki.backup.v1", [...baseRequired, "backup_type", "path", "size_bytes", "verified", "created_by"], { backup_type: { type: "string" }, path: { type: "string" }, size_bytes: { type: "number" }, verified: { type: "boolean" }, created_by: { type: "object" } });
export const migrationRecordSchema = objectSchema("atlas.wiki.migration.v1", [...baseRequired, "migration_id", "applied_at", "checksum", "direction"], { migration_id: { type: "string" }, applied_at: { type: "string" }, checksum: { type: "string" }, direction: { type: "string" } });
export const blobRecordSchema = objectSchema("atlas.wiki.blob.v1", [...baseRequired, "blob_type", "path", "media_type", "size_bytes", "sha256"], { blob_type: { type: "string" }, path: { type: "string" }, media_type: { type: "string" }, size_bytes: { type: "number" }, sha256: { type: "string" } });
export const evaluationRecordSchema = objectSchema("atlas.wiki.evaluation.v1", [...baseRequired, "eval_type", "dataset", "metrics", "passed"], { eval_type: { type: "string" }, dataset: { type: "string" }, metrics: { type: "object" }, passed: { type: "boolean" } });

export const schemas = [
  baseRecordSchema,
  sourceRecordSchema,
  chunkRecordSchema,
  claimRecordSchema,
  entityRecordSchema,
  relationRecordSchema,
  policyRecordSchema,
  accessGrantRecordSchema,
  freshnessRecordSchema,
  conflictRecordSchema,
  proposalRecordSchema,
  approvalRecordSchema,
  auditRecordSchema,
  contextPackRecordSchema,
  connectorRecordSchema,
  ownerRecordSchema,
  retentionRecordSchema,
  redactionRecordSchema,
  embeddingRecordSchema,
  indexManifestRecordSchema,
  backupRecordSchema,
  migrationRecordSchema,
  blobRecordSchema,
  evaluationRecordSchema
] as const;

export const schemaById = new Map(schemas.map((schema) => [schema.$id, schema]));
export const recordSchemaIds = schemas.map((schema) => schema.$id);
