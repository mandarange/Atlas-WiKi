export const schemaSql = `
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT,
  applied_at TEXT NOT NULL,
  package_version TEXT,
  node_version TEXT,
  ordinal INTEGER
);

CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  schema TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY REFERENCES records(id),
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  uri TEXT,
  owner_id TEXT,
  content_hash TEXT NOT NULL,
  extracted_text_ref TEXT,
  stale_after TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  locator_json TEXT,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, source_id UNINDEXED, text);

CREATE TABLE IF NOT EXISTS record_acl (
  record_id TEXT NOT NULL REFERENCES records(id),
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  effect TEXT NOT NULL CHECK(effect IN ('allow', 'deny')),
  permission TEXT NOT NULL,
  PRIMARY KEY (record_id, principal_type, principal_id, permission, effect)
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY REFERENCES records(id),
  proposal_type TEXT NOT NULL,
  target_id TEXT,
  approval_status TEXT NOT NULL,
  requested_by_json TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_json TEXT NOT NULL,
  request_id TEXT NOT NULL,
  record_refs_json TEXT NOT NULL,
  policy_decisions_json TEXT NOT NULL,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hash_prev TEXT,
  hash_self TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_kind_status ON records(kind, status);
CREATE INDEX IF NOT EXISTS idx_sources_title ON sources(title);
CREATE INDEX IF NOT EXISTS idx_chunks_source_ordinal ON chunks(source_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
`;
