create extension if not exists vector with schema extensions;

create table if not exists atlas_wiki.embedding_profiles (
  id text primary key,
  provider_id text not null,
  model text not null,
  dimensions integer not null,
  prompt_policy text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists atlas_wiki.embeddings (
  id uuid primary key default gen_random_uuid(),
  chunk_id text not null references atlas_wiki.chunks(id) on delete cascade,
  profile_id text not null references atlas_wiki.embedding_profiles(id),
  provider_id text not null,
  model text not null,
  dimensions integer not null,
  content_hash text not null,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  stale_at timestamptz
);

alter table atlas_wiki.embedding_profiles enable row level security;
alter table atlas_wiki.embedding_profiles force row level security;
alter table atlas_wiki.embeddings enable row level security;
alter table atlas_wiki.embeddings force row level security;

grant select, insert, update on atlas_wiki.embedding_profiles, atlas_wiki.embeddings to authenticated;
create policy "embedding profiles authenticated visible"
on atlas_wiki.embedding_profiles for select
to authenticated
using (true);

create policy "embedding profiles authenticated write"
on atlas_wiki.embedding_profiles for insert
to authenticated
with check (dimensions > 0 and provider_id <> '' and model <> '');

create policy "embeddings follow chunks"
on atlas_wiki.embeddings for select
to authenticated
using (
  exists (
    select 1
    from atlas_wiki.chunks c
    join atlas_wiki.records r on r.id = c.source_id
    where c.id = embeddings.chunk_id
      and r.deleted_at is null
  )
);

create policy "embeddings authenticated write"
on atlas_wiki.embeddings for insert
to authenticated
with check (
  dimensions = 1536
  and exists (
    select 1 from atlas_wiki.chunks c
    where c.id = embeddings.chunk_id
      and atlas_wiki.can_write_record(c.source_id)
  )
);

create or replace function atlas_wiki.rag_search(
  query_embedding extensions.vector(1536),
  actor_id text,
  actor_groups text[] default '{}',
  max_results integer default 10
)
returns table(chunk_id text, source_id text, similarity double precision, chunk_text text, source_json jsonb)
language sql
stable
security definer
set search_path = atlas_wiki, public, extensions
as $$
  select
    c.id as chunk_id,
    c.source_id,
    1 - (e.embedding <=> query_embedding) as similarity,
    c.text as chunk_text,
    r.json as source_json
  from atlas_wiki.embeddings e
  join atlas_wiki.chunks c on c.id = e.chunk_id
  join atlas_wiki.records r on r.id = c.source_id
  where e.stale_at is null
    and r.deleted_at is null
    and (
      r.json -> 'acl' ->> 'visibility' = 'public'
      or exists (
        select 1 from atlas_wiki.record_acl acl
        where acl.record_id = r.id
          and acl.effect = 'allow'
          and acl.permission in ('read', 'admin')
          and (
            acl.principal_type = 'everyone'
            or acl.principal_id = actor_id
            or acl.principal_id = any(actor_groups)
          )
      )
    )
  order by e.embedding <=> query_embedding
  limit greatest(1, least(max_results, 100));
$$;

grant execute on function atlas_wiki.rag_search(extensions.vector(1536), text, text[], integer) to authenticated;
