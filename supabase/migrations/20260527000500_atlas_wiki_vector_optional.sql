create table if not exists atlas_wiki.embedding_records (
  id text primary key references atlas_wiki.records(id),
  record_id text not null references atlas_wiki.records(id),
  provider text not null,
  model text not null,
  dimensions integer not null,
  vector_hash text not null,
  cache_key text not null,
  metadata jsonb not null default '{}'::jsonb
);

alter table atlas_wiki.embedding_records enable row level security;
alter table atlas_wiki.embedding_records force row level security;

grant select, insert, update on atlas_wiki.embedding_records to authenticated;

create policy "embedding follows source record"
on atlas_wiki.embedding_records for select
to authenticated
using (exists (select 1 from atlas_wiki.records r where r.id = embedding_records.record_id));

create policy "embedding authenticated write"
on atlas_wiki.embedding_records for insert
to authenticated
with check (dimensions > 0);
