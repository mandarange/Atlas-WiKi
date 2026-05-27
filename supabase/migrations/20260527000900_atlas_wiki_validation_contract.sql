create or replace function atlas_wiki.validate_contract()
returns table(finding text)
language plpgsql
stable
security definer
set search_path = atlas_wiki, public, extensions
as $$
declare
  required_table text;
  required_tables text[] := array[
    'records',
    'sources',
    'chunks',
    'record_acl',
    'proposals',
    'audit_events',
    'structured_objects',
    'extraction_runs',
    'embedding_profiles',
    'embeddings'
  ];
  required_rpc text;
  required_rpcs text[] := array['chunk_search', 'rag_search', 'upsert_record_cas'];
begin
  foreach required_table in array required_tables loop
    if to_regclass('atlas_wiki.' || required_table) is null then
      return query select 'supabase_missing_table:' || required_table;
    elsif not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'atlas_wiki'
        and c.relname = required_table
        and c.relrowsecurity
    ) then
      return query select 'supabase_rls_disabled:' || required_table;
    elsif not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'atlas_wiki'
        and c.relname = required_table
        and c.relforcerowsecurity
    ) then
      return query select 'supabase_rls_not_forced:' || required_table;
    end if;
  end loop;

  foreach required_rpc in array required_rpcs loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'atlas_wiki'
        and p.proname = required_rpc
    ) then
      return query select 'supabase_missing_rpc:' || required_rpc;
    end if;
  end loop;

  if not exists (select 1 from pg_extension where extname = 'vector') then
    return query select 'supabase_missing_extension:vector';
  end if;
end;
$$;

grant execute on function atlas_wiki.validate_contract() to authenticated, service_role;

create or replace function atlas_wiki.migration_report(expected_versions text[])
returns table(version text, name text, status text, applied_at timestamptz)
language plpgsql
stable
security definer
set search_path = atlas_wiki, public
as $$
declare
  expected_version text;
  found boolean;
begin
  foreach expected_version in array expected_versions loop
    found := false;
    if to_regclass('supabase_migrations.schema_migrations') is not null then
      execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = $1)'
        into found
        using split_part(expected_version, '_', 1);
    end if;
    return query select
      expected_version,
      regexp_replace(expected_version, '^[0-9]+_', ''),
      case when found then 'applied' else 'pending' end,
      null::timestamptz;
  end loop;
end;
$$;

grant execute on function atlas_wiki.migration_report(text[]) to authenticated, service_role;
