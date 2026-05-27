import { validateRecord } from "../../core/validation/index.js";
import type { AtlasRecord } from "../../core/records/index.js";

export function recordToRow(record: AtlasRecord): Record<string, unknown> {
  return {
    id: record.id,
    schema: record.schema,
    kind: record.kind,
    status: record.status,
    json: record,
    content_hash: record.content_hash,
    revision: record.revision,
    created_at: record.created_at,
    updated_at: record.updated_at,
    created_by: record.created_by ?? null,
    updated_by: record.updated_by ?? null,
    deleted_at: null
  };
}

export function rowToRecord(row: { json?: unknown }): AtlasRecord {
  return validateRecord(row.json);
}
