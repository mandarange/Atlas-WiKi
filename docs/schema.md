# Schema Examples

All records extend `BaseRecord` with deterministic IDs, canonical hashes, revision, status, timestamps, labels, and metadata. Projection tables are derived from canonical record JSON.

## Record Families

Atlas WiKi publishes 24 v1 schema families:

| Record | Schema ID | Projection | ACL inheritance | Redaction fields |
| --- | --- | --- | --- | --- |
| BaseRecord | `atlas.wiki.base.v1` | `records` | none | `metadata` |
| SourceRecord | `atlas.wiki.source.v1` | `records`, `sources`, `record_acl` | own | `uri`, `metadata`, `extracted_text_ref` |
| ChunkRecord | `atlas.wiki.chunk.v1` | `records`, `chunks`, `chunks_fts` | source | `text`, `locator` |
| ClaimRecord | `atlas.wiki.claim.v1` | `records`, `claims` | own | `text`, `normalized_text` |
| EntityRecord | `atlas.wiki.entity.v1` | `records`, `entities` | owner | `aliases`, `metadata` |
| RelationRecord | `atlas.wiki.relation.v1` | `records`, `relations` | source | `metadata` |
| PolicyRecord | `atlas.wiki.policy.v1` | `records`, `policies` | policy | `rules` |
| AccessGrantRecord | `atlas.wiki.access-grant.v1` | `records`, `record_acl` | policy | `grant` |
| FreshnessRecord | `atlas.wiki.freshness.v1` | `records`, `freshness_markers` | source | `reason` |
| ConflictRecord | `atlas.wiki.conflict.v1` | `records`, `conflicts` | source | `summary` |
| ProposalRecord | `atlas.wiki.proposal.v1` | `records`, `proposals` | policy | `payload` |
| ApprovalRecord | `atlas.wiki.approval.v1` | `records`, `approvals` | policy | `comment` |
| AuditRecord | `atlas.wiki.audit.v1` | `records`, `audit_events` | policy | `actor`, `policy_decisions` |
| ContextPackRecord | `atlas.wiki.context-pack.v1` | `records`, `context_packs` | policy | `citations`, `redactions` |
| ConnectorRecord | `atlas.wiki.connector.v1` | `records`, `connectors` | policy | `cursor`, `config_hash` |
| OwnerRecord | `atlas.wiki.owner.v1` | `records`, `owners` | owner | `escalation_refs` |
| RetentionRecord | `atlas.wiki.retention.v1` | `records`, `retention` | policy | `legal_hold` |
| RedactionRecord | `atlas.wiki.redaction.v1` | `records`, `redactions` | policy | `fields`, `reason` |
| EmbeddingRecord | `atlas.wiki.embedding.v1` | `records`, `embeddings` | source | `cache_key` |
| IndexManifestRecord | `atlas.wiki.index-manifest.v1` | `records`, `index_manifests` | policy | `metadata` |
| BackupRecord | `atlas.wiki.backup.v1` | `records`, `backups` | policy | `path` |
| MigrationRecord | `atlas.wiki.migration.v1` | `records`, `migrations` | policy | `checksum` |
| BlobRecord | `atlas.wiki.blob.v1` | `records`, `blobs` | source | `path` |
| EvaluationRecord | `atlas.wiki.evaluation.v1` | `records`, `evaluations` | policy | `metrics`, `dataset` |

## Core Link

`src/core/records` defines the TypeScript interfaces. `src/schemas` exports JSON Schema descriptors, projection mappings, redaction fields, and ACL inheritance hints. `validateRecord` performs runtime validation for each schema family, and `tests/schema-coverage.test.ts` supplies valid and invalid fixtures for every family.

## Security

Schema descriptors include redaction fields and ACL inheritance hints so storage, retrieval, and adapters can apply consistent policy.

## Verification

`tests/schema-coverage.test.ts` validates valid and invalid fixtures for every schema family and checks deterministic ID/hash behavior.

## Operator Notes

Treat schema IDs as semver-like contracts. Add new schema versions instead of changing existing required fields in place.

Structured extraction schemas are registered through `wiki.schema.register(contract)` and inspected with `wiki.schema.list()` or `wiki.schema.get(id)`. Ingestion fails closed when an extractor returns an unregistered schema ID, omits required or identity fields, or falls below the contract confidence threshold.

## Example

```ts
import { contentHash, defaultAccessPolicy, stableId, validateRecord } from "atlas-wiki";

const now = new Date().toISOString();
const source = validateRecord({
  schema: "atlas.wiki.source.v1",
  kind: "source",
  id: stableId("source", { title: "Remote work policy" }),
  status: "active",
  created_at: now,
  updated_at: now,
  revision: 1,
  content_hash: contentHash({ title: "Remote work policy" }),
  source_type: "manual",
  title: "Remote work policy",
  acl: defaultAccessPolicy("internal", "team:knowledge"),
  sensitivity: "internal",
  freshness: { updated_at: now }
});
```
