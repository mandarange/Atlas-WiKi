create table if not exists atlas_wiki.structured_objects (
  id text primary key references atlas_wiki.records(id),
  source_id text references atlas_wiki.sources(id),
  object_type text not null,
  schema_id text not null,
  data jsonb not null,
  confidence numeric not null default 0,
  extraction_run_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists atlas_wiki.extraction_runs (
  id text primary key,
  source_id text references atlas_wiki.sources(id),
  extractor_name text not null,
  extractor_version text not null,
  status text not null,
  input_hash text not null,
  output_hash text,
  started_at timestamptz not null,
  finished_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb
);

create table if not exists atlas_wiki.entities (
  id text primary key references atlas_wiki.records(id),
  entity_type text not null,
  display_name text not null,
  aliases text[] not null default '{}',
  data jsonb not null default '{}'::jsonb
);

create table if not exists atlas_wiki.relations (
  id text primary key references atlas_wiki.records(id),
  relation_type text not null,
  from_id text not null,
  to_id text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0
);

alter table atlas_wiki.structured_objects enable row level security;
alter table atlas_wiki.structured_objects force row level security;
alter table atlas_wiki.extraction_runs enable row level security;
alter table atlas_wiki.extraction_runs force row level security;
alter table atlas_wiki.entities enable row level security;
alter table atlas_wiki.entities force row level security;
alter table atlas_wiki.relations enable row level security;
alter table atlas_wiki.relations force row level security;

grant select, insert, update on atlas_wiki.structured_objects, atlas_wiki.extraction_runs, atlas_wiki.entities, atlas_wiki.relations to authenticated;

create policy "structured follows record"
on atlas_wiki.structured_objects for select
to authenticated
using (exists (select 1 from atlas_wiki.records r where r.id = structured_objects.id));

create policy "structured authenticated write"
on atlas_wiki.structured_objects for insert
to authenticated
with check (confidence >= 0 and confidence <= 1 and atlas_wiki.can_write_record(id));

create policy "extraction runs authenticated"
on atlas_wiki.extraction_runs for select
to authenticated
using (exists (select 1 from atlas_wiki.records r where r.id = extraction_runs.source_id));

create policy "extraction runs authenticated insert"
on atlas_wiki.extraction_runs for insert
to authenticated
with check (source_id is null or atlas_wiki.can_write_record(source_id));

create policy "entities follows record"
on atlas_wiki.entities for select
to authenticated
using (exists (select 1 from atlas_wiki.records r where r.id = entities.id));

create policy "relations follows record"
on atlas_wiki.relations for select
to authenticated
using (exists (select 1 from atlas_wiki.records r where r.id = relations.id));
