create schema if not exists atlas_wiki;

create table if not exists atlas_wiki.records (
  id text primary key,
  schema text not null,
  kind text not null,
  status text not null default 'active',
  json jsonb not null,
  content_hash text not null,
  revision integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by jsonb,
  updated_by jsonb,
  deleted_at timestamptz
);

create table if not exists atlas_wiki.sources (
  id text primary key references atlas_wiki.records(id),
  source_type text not null,
  title text not null,
  uri text,
  owner_id text,
  content_hash text not null,
  extracted_text_ref text,
  stale_after timestamptz,
  updated_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists atlas_wiki.chunks (
  id text primary key,
  source_id text not null references atlas_wiki.sources(id),
  ordinal integer not null,
  text text not null,
  text_hash text not null,
  locator_json jsonb,
  created_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists atlas_wiki.record_acl (
  record_id text not null references atlas_wiki.records(id),
  principal_type text not null,
  principal_id text not null,
  effect text not null check (effect in ('allow', 'deny')),
  permission text not null check (permission in ('read', 'write', 'admin')),
  primary key (record_id, principal_type, principal_id, permission, effect)
);

create table if not exists atlas_wiki.proposals (
  id text primary key references atlas_wiki.records(id),
  proposal_type text not null,
  target_id text,
  approval_status text not null,
  requested_by_json jsonb not null,
  payload_json jsonb not null
);

create index if not exists idx_atlas_records_kind_status on atlas_wiki.records(kind, status);
create index if not exists idx_atlas_sources_title on atlas_wiki.sources(title);
create index if not exists idx_atlas_chunks_source_ordinal on atlas_wiki.chunks(source_id, ordinal);
