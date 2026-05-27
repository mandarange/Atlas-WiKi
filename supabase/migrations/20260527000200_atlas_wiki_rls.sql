revoke all on schema atlas_wiki from anon, authenticated;
grant usage on schema atlas_wiki to anon, authenticated, service_role;

alter table atlas_wiki.records enable row level security;
alter table atlas_wiki.records force row level security;
alter table atlas_wiki.sources enable row level security;
alter table atlas_wiki.sources force row level security;
alter table atlas_wiki.chunks enable row level security;
alter table atlas_wiki.chunks force row level security;
alter table atlas_wiki.record_acl enable row level security;
alter table atlas_wiki.record_acl force row level security;
alter table atlas_wiki.proposals enable row level security;
alter table atlas_wiki.proposals force row level security;

grant select on atlas_wiki.records, atlas_wiki.sources, atlas_wiki.chunks to anon, authenticated;
grant select on atlas_wiki.record_acl to authenticated;
grant insert on atlas_wiki.records, atlas_wiki.sources, atlas_wiki.chunks, atlas_wiki.proposals to authenticated;
grant update on atlas_wiki.records, atlas_wiki.sources, atlas_wiki.chunks, atlas_wiki.proposals to authenticated;
grant insert on atlas_wiki.record_acl to authenticated;

create or replace function atlas_wiki.current_actor_id()
returns text
language sql
stable
set search_path = atlas_wiki, public
as $$
  select coalesce(auth.jwt() ->> 'atlas_actor_id', auth.uid()::text)
$$;

create or replace function atlas_wiki.can_write_record(target_record_id text)
returns boolean
language sql
stable
security definer
set search_path = atlas_wiki, public
as $$
  select exists (
    select 1 from atlas_wiki.record_acl acl
    where acl.record_id = target_record_id
      and acl.effect = 'allow'
      and acl.permission in ('write', 'admin')
      and (
        (acl.principal_type = 'user' and acl.principal_id = atlas_wiki.current_actor_id())
        or (acl.principal_type = 'team' and acl.principal_id = any (select jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'teams', '[]'::jsonb))))
        or (acl.principal_type = 'role' and acl.principal_id = any (select jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb))))
      )
  )
  or exists (
    select 1
    from atlas_wiki.records r,
      jsonb_to_recordset(coalesce(r.json -> 'acl' -> 'grants', '[]'::jsonb)) as grant(principal_type text, principal_id text, permission text, effect text)
    where r.id = target_record_id
      and grant.effect = 'allow'
      and grant.permission in ('write', 'admin')
      and (
        (grant.principal_type = 'user' and grant.principal_id = atlas_wiki.current_actor_id())
        or (grant.principal_type = 'team' and grant.principal_id = any (select jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'teams', '[]'::jsonb))))
        or (grant.principal_type = 'role' and grant.principal_id = any (select jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb))))
      )
  )
$$;

create policy "records public read"
on atlas_wiki.records for select
to anon, authenticated
using (
  json -> 'acl' ->> 'visibility' = 'public'
  or exists (
    select 1 from atlas_wiki.record_acl acl
    where acl.record_id = records.id
      and acl.effect = 'allow'
      and acl.permission in ('read', 'admin')
      and (
        acl.principal_type = 'everyone'
        or (acl.principal_type = 'authenticated' and auth.role() = 'authenticated')
        or (acl.principal_type = 'user' and acl.principal_id = atlas_wiki.current_actor_id())
        or (acl.principal_type = 'team' and acl.principal_id = any (select jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'teams', '[]'::jsonb))))
        or (acl.principal_type = 'role' and acl.principal_id = any (select jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb))))
      )
  )
);

create policy "records authenticated insert"
on atlas_wiki.records for insert
to authenticated
with check (
  status in ('active', 'pending_approval', 'draft')
  and (
    kind = 'proposal'
    or json -> 'acl' ->> 'visibility' in ('public', 'internal')
    or exists (
      select 1
      from jsonb_to_recordset(coalesce(json -> 'acl' -> 'grants', '[]'::jsonb)) as grant(principal_type text, principal_id text, permission text, effect text)
      where grant.effect = 'allow'
        and grant.permission in ('write', 'admin')
        and grant.principal_type = 'user'
        and grant.principal_id = atlas_wiki.current_actor_id()
    )
  )
);

create policy "records authenticated revision update"
on atlas_wiki.records for update
to authenticated
using (deleted_at is null and atlas_wiki.can_write_record(id))
with check (deleted_at is null and revision >= 1 and atlas_wiki.can_write_record(id));

create policy "sources follow records"
on atlas_wiki.sources for select
to anon, authenticated
using (exists (select 1 from atlas_wiki.records r where r.id = sources.id));

create policy "sources authenticated write"
on atlas_wiki.sources for insert
to authenticated
with check (atlas_wiki.can_write_record(id));

create policy "sources authenticated update"
on atlas_wiki.sources for update
to authenticated
using (atlas_wiki.can_write_record(id))
with check (atlas_wiki.can_write_record(id));

create policy "chunks follow source records"
on atlas_wiki.chunks for select
to anon, authenticated
using (exists (select 1 from atlas_wiki.records r where r.id = chunks.source_id));

create policy "chunks authenticated write"
on atlas_wiki.chunks for insert
to authenticated
with check (atlas_wiki.can_write_record(source_id));

create policy "chunks authenticated update"
on atlas_wiki.chunks for update
to authenticated
using (atlas_wiki.can_write_record(source_id))
with check (atlas_wiki.can_write_record(source_id));

create policy "acl authenticated visible"
on atlas_wiki.record_acl for select
to authenticated
using (
  exists (select 1 from atlas_wiki.records r where r.id = record_acl.record_id)
);

create policy "acl authenticated write"
on atlas_wiki.record_acl for insert
to authenticated
with check (atlas_wiki.can_write_record(record_id));

create policy "proposals requester visible"
on atlas_wiki.proposals for select
to authenticated
using (requested_by_json ->> 'id' = coalesce(auth.jwt() ->> 'atlas_actor_id', auth.uid()::text));

create policy "proposals authenticated insert"
on atlas_wiki.proposals for insert
to authenticated
with check (requested_by_json ? 'id');
