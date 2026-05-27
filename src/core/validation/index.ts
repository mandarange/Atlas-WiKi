import { z } from "zod";
import type { AtlasRecord } from "../records/index.js";
import { UnknownRecordSchemaError, ValidationError } from "../errors/index.js";

const accessGrant = z.object({
  principal_type: z.enum(["user", "team", "role", "everyone", "authenticated"]),
  principal_id: z.string().min(1),
  permission: z.enum(["read", "write", "admin"]),
  effect: z.enum(["allow", "deny"])
});

const acl = z.object({
  visibility: z.enum(["public", "internal", "private"]),
  grants: z.array(accessGrant)
});

const actor = z.object({
  id: z.string().min(1),
  type: z.enum(["user", "service", "anonymous"]),
  groups: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional()
});

const owner = z.object({
  id: z.string().min(1),
  type: z.enum(["user", "team", "organization"])
});

const recordRef = z.object({
  id: z.string().min(1),
  schema: z.string().min(1),
  kind: z.string().optional()
}).passthrough();

const sourceRef = recordRef.extend({
  locator: z.object({}).passthrough().optional()
}).passthrough();

const freshness = z.object({
  updated_at: z.string().optional(),
  valid_from: z.string().optional(),
  valid_until: z.string().optional(),
  stale_after: z.string().optional()
}).passthrough();

const policyDecision = z.object({
  record_ref: recordRef.optional(),
  allowed: z.boolean(),
  reason: z.string().min(1)
});

const baseRecord = z.object({
  schema: z.string().min(1),
  id: z.string().min(1),
  kind: z.string().min(1),
  status: z.enum(["draft", "active", "pending_approval", "deprecated", "rejected", "deleted"]),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  revision: z.number().int().positive(),
  content_hash: z.string().min(12),
  labels: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).passthrough();

export const baseRecordValidator = baseRecord.extend({
  schema: z.literal("atlas.wiki.base.v1"),
  kind: z.literal("base")
}).passthrough();

export const sourceRecordValidator = baseRecord.extend({
  schema: z.literal("atlas.wiki.source.v1"),
  kind: z.literal("source"),
  source_type: z.enum(["file", "page", "message", "email", "ticket", "meeting", "database", "manual", "web"]),
  title: z.string().min(1),
  owner: owner.optional(),
  acl,
  sensitivity: z.enum(["public", "internal", "confidential", "restricted", "secret"]),
  freshness
}).passthrough();

export const chunkRecordValidator = baseRecord.extend({
  schema: z.literal("atlas.wiki.chunk.v1"),
  kind: z.literal("chunk"),
  source_ref: sourceRef,
  ordinal: z.number().int().nonnegative(),
  text: z.string(),
  text_hash: z.string().min(1),
  acl,
  sensitivity: z.enum(["public", "internal", "confidential", "restricted", "secret"])
}).passthrough();

export const claimRecordValidator = baseRecord.extend({
  schema: z.literal("atlas.wiki.claim.v1"),
  kind: z.literal("claim"),
  claim_type: z.enum(["fact", "policy", "procedure", "decision", "definition", "faq", "status", "constraint"]),
  text: z.string().min(1),
  source_refs: z.array(sourceRef),
  entity_refs: z.array(recordRef),
  acl,
  sensitivity: z.enum(["public", "internal", "confidential", "restricted", "secret"]),
  freshness,
  trust: z.object({ authority_score: z.number(), confidence_score: z.number(), conflict_score: z.number() })
}).passthrough();

export const recordValidators = {
  "atlas.wiki.base.v1": baseRecordValidator,
  "atlas.wiki.source.v1": sourceRecordValidator,
  "atlas.wiki.chunk.v1": chunkRecordValidator,
  "atlas.wiki.claim.v1": claimRecordValidator,
  "atlas.wiki.entity.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.entity.v1"), kind: z.literal("entity"), entity_type: z.enum(["person", "team", "customer", "product", "project", "system", "policy", "contract", "vendor", "location", "topic"]), display_name: z.string().min(1), aliases: z.array(z.string()), owner: owner.optional(), acl: acl.optional() }).passthrough(),
  "atlas.wiki.relation.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.relation.v1"), kind: z.literal("relation"), relation_type: z.enum(["supports", "contradicts", "supersedes", "depends_on", "owned_by", "applies_to", "mentions", "derived_from"]), from: recordRef, to: recordRef, evidence_refs: z.array(sourceRef), confidence: z.number().min(0).max(1) }).passthrough(),
  "atlas.wiki.policy.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.policy.v1"), kind: z.literal("policy"), policy_type: z.enum(["access", "redaction", "retention", "approval", "freshness", "connector"]), scope: z.object({}).passthrough(), rules: z.array(z.object({ id: z.string().min(1), effect: z.enum(["allow", "deny", "redact", "require_approval"]), condition: z.record(z.string(), z.unknown()) })), enforcement: z.enum(["advisory", "blocking"]) }).passthrough(),
  "atlas.wiki.access-grant.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.access-grant.v1"), kind: z.literal("access_grant"), record_ref: recordRef, grant: accessGrant, inherited_from: recordRef.optional() }).passthrough(),
  "atlas.wiki.freshness.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.freshness.v1"), kind: z.literal("freshness"), record_ref: recordRef, policy: freshness, stale: z.boolean(), checked_at: z.string().min(1), reason: z.string().optional() }).passthrough(),
  "atlas.wiki.conflict.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.conflict.v1"), kind: z.literal("conflict"), record_refs: z.array(recordRef).min(1), conflict_type: z.enum(["contradiction", "duplicate", "stale", "ownership", "policy"]), severity: z.enum(["low", "medium", "high", "critical"]), summary: z.string().min(1), resolution_status: z.enum(["open", "resolved", "accepted"]) }).passthrough(),
  "atlas.wiki.proposal.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.proposal.v1"), kind: z.literal("proposal"), proposal_type: z.enum(["claim", "update", "deprecate", "conflict"]), target_ref: recordRef.optional(), payload: z.record(z.string(), z.unknown()), requested_by: actor, approval_status: z.enum(["pending", "approved", "rejected"]) }).passthrough(),
  "atlas.wiki.extraction-run.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.extraction-run.v1"), kind: z.literal("extraction_run"), source_ref: sourceRef, extractor_name: z.string().min(1), extractor_version: z.string().min(1), run_status: z.enum(["pending", "completed", "failed"]), input_hash: z.string().min(1), output_hash: z.string().optional(), metrics: z.record(z.string(), z.unknown()), errors: z.array(z.record(z.string(), z.unknown())) }).passthrough(),
  "atlas.wiki.structured-object.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.structured-object.v1"), kind: z.literal("structured_object"), source_ref: sourceRef, object_type: z.string().min(1), schema_id: z.string().min(1), data: z.record(z.string(), z.unknown()), confidence: z.number().min(0).max(1), evidence_refs: z.array(sourceRef).min(1), extraction_run_ref: recordRef.optional(), acl, sensitivity: z.enum(["public", "internal", "confidential", "restricted", "secret"]) }).passthrough(),
  "atlas.wiki.schema-contract.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.schema-contract.v1"), kind: z.literal("schema_contract"), name: z.string().min(1), version: z.string().min(1), description: z.string().optional(), json_schema: z.record(z.string(), z.unknown()), required_fields: z.array(z.string()), identity_fields: z.array(z.string()), confidence_threshold: z.number().min(0).max(1), conflict_keys: z.array(z.string()) }).passthrough(),
  "atlas.wiki.field-observation.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.field-observation.v1"), kind: z.literal("field_observation"), source_ref: sourceRef, field_name: z.string().min(1), value: z.unknown(), confidence: z.number().min(0).max(1), evidence_refs: z.array(sourceRef).min(1) }).passthrough(),
  "atlas.wiki.table-extraction.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.table-extraction.v1"), kind: z.literal("table_extraction"), source_ref: sourceRef, headers: z.array(z.string()).min(1), rows: z.array(z.record(z.string(), z.unknown())), evidence_refs: z.array(sourceRef).min(1) }).passthrough(),
  "atlas.wiki.normalized-value.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.normalized-value.v1"), kind: z.literal("normalized_value"), source_ref: sourceRef, raw_value: z.unknown(), normalized_value: z.unknown(), value_type: z.string().min(1), confidence: z.number().min(0).max(1), evidence_refs: z.array(sourceRef).min(1) }).passthrough(),
  "atlas.wiki.extraction-review.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.extraction-review.v1"), kind: z.literal("extraction_review"), source_ref: sourceRef, extraction_run_ref: recordRef.optional(), reviewer: actor.optional(), review_status: z.enum(["pending", "approved", "rejected"]), notes: z.string().optional() }).passthrough(),
  "atlas.wiki.approval.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.approval.v1"), kind: z.literal("approval"), proposal_ref: recordRef, approver: actor, decision: z.enum(["approved", "rejected", "needs_changes"]), decided_at: z.string().min(1), comment: z.string().optional() }).passthrough(),
  "atlas.wiki.audit.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.audit.v1"), kind: z.literal("audit"), event_type: z.string().min(1), actor, record_refs: z.array(recordRef), policy_decisions: z.array(policyDecision), outcome: z.enum(["success", "denied", "error"]), hash_prev: z.string().optional(), hash_self: z.string().min(1) }).passthrough(),
  "atlas.wiki.context-pack.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.context-pack.v1"), kind: z.literal("context_pack"), query: z.string(), actor, included_refs: z.array(recordRef), citations: z.array(z.object({ id: z.string(), source_ref: sourceRef, title: z.string() }).passthrough()), redactions: z.array(z.object({ record_ref: recordRef, field: z.string(), reason: z.string() }).passthrough()), freshness_markers: z.array(z.object({ record_ref: recordRef, stale: z.boolean() }).passthrough()), conflict_markers: z.array(z.object({ record_ref: recordRef, conflict_score: z.number(), reason: z.string() }).passthrough()), policy_decisions: z.array(policyDecision), denied_count: z.number().int().nonnegative(), redacted_count: z.number().int().nonnegative(), stale_count: z.number().int().nonnegative(), conflict_count: z.number().int().nonnegative(), candidate_count: z.number().int().nonnegative(), authorized_count: z.number().int().nonnegative(), query_backend: z.enum(["fts5", "like_fallback", "none"]), fallback_reason: z.string().nullable().optional() }).passthrough(),
  "atlas.wiki.connector.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.connector.v1"), kind: z.literal("connector"), connector_type: z.string().min(1), display_name: z.string().min(1), connector_status: z.enum(["enabled", "disabled", "degraded"]), cursor: z.string().optional(), config_hash: z.string().optional() }).passthrough(),
  "atlas.wiki.owner.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.owner.v1"), kind: z.literal("owner"), owner, display_name: z.string().min(1), escalation_refs: z.array(owner) }).passthrough(),
  "atlas.wiki.retention.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.retention.v1"), kind: z.literal("retention"), record_ref: recordRef, retention_until: z.string().optional(), legal_hold: z.boolean(), action: z.enum(["keep", "redact", "delete", "archive"]) }).passthrough(),
  "atlas.wiki.redaction.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.redaction.v1"), kind: z.literal("redaction"), record_ref: recordRef, fields: z.array(z.string()).min(1), reason: z.string().min(1), applied_at: z.string().min(1), reversible: z.boolean() }).passthrough(),
  "atlas.wiki.embedding.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.embedding.v1"), kind: z.literal("embedding"), record_ref: recordRef, provider: z.string().min(1), model: z.string().min(1), dimensions: z.number().int().positive(), vector_hash: z.string().min(1), cache_key: z.string().min(1) }).passthrough(),
  "atlas.wiki.index-manifest.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.index-manifest.v1"), kind: z.literal("index_manifest"), index_type: z.enum(["fts", "vector", "graph"]), version: z.string().min(1), record_count: z.number().int().nonnegative(), built_at: z.string().min(1) }).passthrough(),
  "atlas.wiki.backup.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.backup.v1"), kind: z.literal("backup"), backup_type: z.enum(["sqlite", "json", "ndjson"]), path: z.string().min(1), size_bytes: z.number().int().nonnegative(), verified: z.boolean(), created_by: actor }).passthrough(),
  "atlas.wiki.migration.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.migration.v1"), kind: z.literal("migration"), migration_id: z.string().min(1), applied_at: z.string().min(1), checksum: z.string().min(1), direction: z.enum(["up", "down"]) }).passthrough(),
  "atlas.wiki.blob.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.blob.v1"), kind: z.literal("blob"), blob_type: z.enum(["source", "attachment", "extracted_text", "thumbnail"]), path: z.string().min(1), media_type: z.string().min(1), size_bytes: z.number().int().nonnegative(), sha256: z.string().min(1) }).passthrough(),
  "atlas.wiki.evaluation.v1": baseRecord.extend({ schema: z.literal("atlas.wiki.evaluation.v1"), kind: z.literal("evaluation"), eval_type: z.enum(["retrieval", "redaction", "freshness", "conflict", "permission"]), dataset: z.string().min(1), metrics: z.record(z.string(), z.number()), passed: z.boolean() }).passthrough()
} as const;

export type AtlasSchemaId = keyof typeof recordValidators;

export interface ValidateRecordOptions {
  unknownSchema?: "reject" | "quarantine" | "accept" | undefined;
  production?: boolean | undefined;
}

export function validateRecord(record: unknown, options: ValidateRecordOptions = {}): AtlasRecord {
  const unknownSchema = options.unknownSchema ?? "reject";
  if (unknownSchema === "accept" && (options.production ?? process.env.NODE_ENV === "production")) {
    throw new ValidationError("unknownSchema=accept is forbidden in production");
  }
  const schema = typeof record === "object" && record ? (record as { schema?: unknown }).schema : undefined;
  if (typeof schema !== "string" || !(schema in recordValidators)) {
    if (unknownSchema === "reject") throw new UnknownRecordSchemaError(typeof schema === "string" ? schema : undefined);
    if (unknownSchema === "quarantine") {
      const parsed = baseRecord.safeParse(record);
      if (!parsed.success) throw new ValidationError("Record validation failed", parsed.error.flatten());
      return {
        ...parsed.data,
        status: "rejected",
        metadata: {
          ...parsed.data.metadata,
          quarantine_reason: "unknown_schema",
          original_schema: schema
        }
      } as unknown as AtlasRecord;
    }
  }
  const validator = typeof schema === "string" && schema in recordValidators ? recordValidators[schema as AtlasSchemaId] : baseRecord;
  const parsed = validator.safeParse(record);
  if (!parsed.success) throw new ValidationError("Record validation failed", parsed.error.flatten());
  return parsed.data as unknown as AtlasRecord;
}
