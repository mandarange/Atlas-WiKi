import { describe, expect, it } from "vitest";
import { contentHash, defaultAccessPolicy, recordSchemaDescriptors, schemas, stableId, validateRecord } from "../src/index.js";

const now = "2026-01-01T00:00:00.000Z";
const actor = { id: "user:alice", type: "user" as const, groups: ["team:docs"] };
const ref = { id: "src_policy_remote", schema: "atlas.wiki.source.v1", kind: "source" };
const sourceRef = { ...ref, locator: { path: "handbook.md", line_start: 1, line_end: 4 } };
const owner = { id: "team:knowledge", type: "team" as const };

function base(schema: string, kind: string): Record<string, unknown> {
  const seed = { schema, kind };
  return {
    schema,
    kind,
    id: stableId(kind, seed),
    status: "active",
    created_at: now,
    updated_at: now,
    revision: 1,
    content_hash: contentHash(seed)
  };
}

function fixture(schema: string): Record<string, unknown> {
  switch (schema) {
    case "atlas.wiki.base.v1":
      return base(schema, "base");
    case "atlas.wiki.source.v1":
      return { ...base(schema, "source"), source_type: "manual", title: "Remote work policy", owner, acl: defaultAccessPolicy("internal", owner.id), sensitivity: "internal", freshness: { updated_at: now } };
    case "atlas.wiki.chunk.v1":
      return { ...base(schema, "chunk"), source_ref: sourceRef, ordinal: 0, text: "Remote work is approved.", text_hash: contentHash("Remote work is approved."), acl: defaultAccessPolicy("internal", owner.id), sensitivity: "internal" };
    case "atlas.wiki.claim.v1":
      return { ...base(schema, "claim"), claim_type: "policy", text: "Remote work is approved.", source_refs: [sourceRef], entity_refs: [], acl: defaultAccessPolicy("internal", owner.id), sensitivity: "internal", freshness: { updated_at: now }, trust: { authority_score: 0.8, confidence_score: 0.9, conflict_score: 0 } };
    case "atlas.wiki.entity.v1":
      return { ...base(schema, "entity"), entity_type: "policy", display_name: "Remote Work", aliases: ["WFH"], owner, acl: defaultAccessPolicy("internal", owner.id) };
    case "atlas.wiki.relation.v1":
      return { ...base(schema, "relation"), relation_type: "supports", from: ref, to: { id: "claim_remote", schema: "atlas.wiki.claim.v1", kind: "claim" }, evidence_refs: [sourceRef], confidence: 0.9 };
    case "atlas.wiki.policy.v1":
      return { ...base(schema, "policy"), policy_type: "access", scope: { owner_id: owner.id }, rules: [{ id: "allow-owner", effect: "allow", condition: { owner_id: owner.id } }], enforcement: "blocking" };
    case "atlas.wiki.access-grant.v1":
      return { ...base(schema, "access_grant"), record_ref: ref, grant: { principal_type: "team", principal_id: owner.id, permission: "read", effect: "allow" } };
    case "atlas.wiki.freshness.v1":
      return { ...base(schema, "freshness"), record_ref: ref, policy: { updated_at: now, stale_after: "2026-12-31T00:00:00.000Z" }, stale: false, checked_at: now };
    case "atlas.wiki.conflict.v1":
      return { ...base(schema, "conflict"), record_refs: [ref], conflict_type: "stale", severity: "low", summary: "No current conflict.", resolution_status: "open" };
    case "atlas.wiki.proposal.v1":
      return { ...base(schema, "proposal"), status: "pending_approval", proposal_type: "claim", target_ref: ref, payload: { text: "Remote work policy update" }, requested_by: actor, approval_status: "pending" };
    case "atlas.wiki.approval.v1":
      return { ...base(schema, "approval"), proposal_ref: { id: "proposal_remote", schema: "atlas.wiki.proposal.v1", kind: "proposal" }, approver: actor, decision: "approved", decided_at: now };
    case "atlas.wiki.audit.v1":
      return { ...base(schema, "audit"), event_type: "search", actor, record_refs: [ref], policy_decisions: [{ record_ref: ref, allowed: true, reason: "acl_allow" }], outcome: "success", hash_self: contentHash("audit") };
    case "atlas.wiki.context-pack.v1":
      return { ...base(schema, "context_pack"), query: "remote work", actor, included_refs: [ref], citations: [{ id: "citation_remote", source_ref: sourceRef, title: "Remote policy" }], redactions: [], freshness_markers: [{ record_ref: ref, stale: false }], conflict_markers: [], policy_decisions: [{ record_ref: ref, allowed: true, reason: "acl_allow" }], denied_count: 0, redacted_count: 0, stale_count: 0, conflict_count: 0, candidate_count: 1, authorized_count: 1, query_backend: "fts5", fallback_reason: null };
    case "atlas.wiki.connector.v1":
      return { ...base(schema, "connector"), connector_type: "local-file", display_name: "Local Files", connector_status: "enabled", cursor: "0" };
    case "atlas.wiki.owner.v1":
      return { ...base(schema, "owner"), owner, display_name: "Knowledge Team", escalation_refs: [owner] };
    case "atlas.wiki.retention.v1":
      return { ...base(schema, "retention"), record_ref: ref, retention_until: "2030-01-01T00:00:00.000Z", legal_hold: false, action: "archive" };
    case "atlas.wiki.redaction.v1":
      return { ...base(schema, "redaction"), record_ref: ref, fields: ["text"], reason: "secret-pattern", applied_at: now, reversible: true };
    case "atlas.wiki.embedding.v1":
      return { ...base(schema, "embedding"), record_ref: ref, provider: "local", model: "mock", dimensions: 3, vector_hash: contentHash([0, 1, 0]), cache_key: "local:mock:src_policy_remote" };
    case "atlas.wiki.index-manifest.v1":
      return { ...base(schema, "index_manifest"), index_type: "fts", version: "1", record_count: 1, built_at: now };
    case "atlas.wiki.backup.v1":
      return { ...base(schema, "backup"), backup_type: "sqlite", path: "exports/sqlite-backups/test.bak", size_bytes: 4096, verified: true, created_by: actor };
    case "atlas.wiki.migration.v1":
      return { ...base(schema, "migration"), migration_id: "0001_initial", applied_at: now, checksum: contentHash("0001_initial"), direction: "up" };
    case "atlas.wiki.blob.v1":
      return { ...base(schema, "blob"), blob_type: "extracted_text", path: "blobs/extracted-text/source.txt", media_type: "text/plain", size_bytes: 42, sha256: contentHash("blob") };
    case "atlas.wiki.evaluation.v1":
      return { ...base(schema, "evaluation"), eval_type: "retrieval", dataset: "golden", metrics: { recall: 1, precision: 1 }, passed: true };
    default:
      throw new Error(`missing fixture for ${schema}`);
  }
}

describe("schema coverage", () => {
  it("defines schema descriptors for every record family in the goal checklist", () => {
    expect(schemas).toHaveLength(24);
    expect(recordSchemaDescriptors).toHaveLength(24);
    expect(new Set(recordSchemaDescriptors.map((descriptor) => descriptor.schemaId)).size).toBe(24);
    expect(recordSchemaDescriptors.every((descriptor) => descriptor.projection && descriptor.redactionFields && descriptor.aclSource)).toBe(true);
  });

  it.each(schemas.map((schema) => schema.$id))("validates valid and invalid %s fixtures", (schemaId) => {
    const valid = fixture(schemaId);
    expect(validateRecord(valid).schema).toBe(schemaId);
    const invalid = { ...valid };
    delete invalid.id;
    expect(() => validateRecord(invalid)).toThrow();
  });

  it("keeps stable id and canonical hash generation deterministic for schema fixtures", () => {
    const source = fixture("atlas.wiki.source.v1");
    expect(stableId("source", source)).toBe(stableId("source", { ...source }));
    expect(contentHash(source)).toBe(contentHash({ ...source }));
  });
});
