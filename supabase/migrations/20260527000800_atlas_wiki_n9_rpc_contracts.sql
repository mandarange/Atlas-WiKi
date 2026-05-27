create or replace function atlas_wiki.chunk_search(
  search_text text,
  actor_id text,
  actor_groups text[] default '{}',
  max_results integer default 10
)
returns table(chunk_id text, source_id text, score double precision, chunk_text text, source_json jsonb)
language sql
stable
security definer
set search_path = atlas_wiki, public
as $$
  select
    c.id as chunk_id,
    c.source_id,
    case
      when c.text ilike '%' || search_text || '%' then 1.0
      when s.title ilike '%' || search_text || '%' then 0.6
      else 0.1
    end as score,
    c.text as chunk_text,
    r.json as source_json
  from atlas_wiki.chunks c
  join atlas_wiki.sources s on s.id = c.source_id
  join atlas_wiki.records r on r.id = c.source_id
  where r.deleted_at is null
    and search_text <> ''
    and (
      c.text ilike '%' || search_text || '%'
      or s.title ilike '%' || search_text || '%'
    )
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
  order by score desc, c.created_at desc
  limit greatest(1, least(max_results, 100));
$$;

grant execute on function atlas_wiki.chunk_search(text, text, text[], integer) to authenticated;

create or replace function atlas_wiki.rag_search(
  query_embedding extensions.vector(1536),
  actor_id text,
  actor_groups text[] default '{}',
  max_results integer default 10,
  target_profile_id text default null
)
returns table(
  chunk_id text,
  source_id text,
  similarity double precision,
  chunk_text text,
  source_json jsonb,
  content_hash text,
  vector_json jsonb,
  profile_id text,
  provider_id text,
  model text,
  dimensions integer
)
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
    r.json as source_json,
    e.content_hash,
    e.vector_json,
    e.profile_id,
    e.provider_id,
    e.model,
    e.dimensions
  from atlas_wiki.embeddings e
  join atlas_wiki.chunks c on c.id = e.chunk_id
  join atlas_wiki.records r on r.id = c.source_id
  where e.stale_at is null
    and e.embedding is not null
    and (target_profile_id is null or e.profile_id = target_profile_id)
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

grant execute on function atlas_wiki.rag_search(extensions.vector(1536), text, text[], integer, text) to authenticated;

create or replace function atlas_wiki.upsert_record_cas(
  record_json jsonb,
  expected_revision integer,
  allow_create boolean default false
)
returns table(record_json jsonb, created boolean, previous_revision integer, revision integer)
language plpgsql
security definer
set search_path = atlas_wiki, public
as $$
declare
  target_id text := record_json ->> 'id';
  existing_revision integer;
  next_revision integer;
  final_json jsonb;
  created_at_value timestamptz;
  updated_at_value timestamptz;
begin
  if target_id is null or target_id = '' then
    raise exception 'record_json.id is required' using errcode = '23502';
  end if;
  if expected_revision is null then
    raise exception 'expected_revision is required' using errcode = '23502';
  end if;

  select r.revision
    into existing_revision
    from atlas_wiki.records r
    where r.id = target_id and r.deleted_at is null
    for update;

  if existing_revision is null then
    if not allow_create or expected_revision <> 0 then
      raise exception 'record CAS conflict for %: expected %, actual null', target_id, expected_revision using errcode = '40001';
    end if;
    next_revision := greatest(coalesce((record_json ->> 'revision')::integer, 1), 1);
    final_json := jsonb_set(record_json, '{revision}', to_jsonb(next_revision), true);
    created_at_value := coalesce((final_json ->> 'created_at')::timestamptz, now());
    updated_at_value := coalesce((final_json ->> 'updated_at')::timestamptz, created_at_value);

    insert into atlas_wiki.records (
      id, schema, kind, status, json, content_hash, revision, created_at, updated_at, created_by, updated_by, deleted_at
    ) values (
      target_id,
      final_json ->> 'schema',
      final_json ->> 'kind',
      coalesce(final_json ->> 'status', 'active'),
      final_json,
      final_json ->> 'content_hash',
      next_revision,
      created_at_value,
      updated_at_value,
      final_json -> 'created_by',
      final_json -> 'updated_by',
      null
    );
    return query select final_json, true, null::integer, next_revision;
    return;
  end if;

  if existing_revision <> expected_revision then
    raise exception 'record CAS conflict for %: expected %, actual %', target_id, expected_revision, existing_revision using errcode = '40001';
  end if;

  next_revision := expected_revision + 1;
  final_json := jsonb_set(record_json, '{revision}', to_jsonb(next_revision), true);
  updated_at_value := coalesce((final_json ->> 'updated_at')::timestamptz, now());

  update atlas_wiki.records
    set schema = final_json ->> 'schema',
        kind = final_json ->> 'kind',
        status = coalesce(final_json ->> 'status', 'active'),
        json = final_json,
        content_hash = final_json ->> 'content_hash',
        revision = next_revision,
        updated_at = updated_at_value,
        updated_by = final_json -> 'updated_by',
        deleted_at = null
    where id = target_id and revision = expected_revision;

  if not found then
    raise exception 'record CAS conflict for %: expected %', target_id, expected_revision using errcode = '40001';
  end if;

  return query select final_json, false, existing_revision, next_revision;
end;
$$;

grant execute on function atlas_wiki.upsert_record_cas(jsonb, integer, boolean) to authenticated;
