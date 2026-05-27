create or replace function atlas_wiki.search_records(search_text text, max_results integer default 10)
returns table(id text, json jsonb)
language sql
stable
set search_path = atlas_wiki, public
as $$
  select r.id, r.json
  from atlas_wiki.records r
  left join atlas_wiki.sources s on s.id = r.id
  where r.deleted_at is null
    and r.kind = 'source'
    and (
      s.title ilike '%' || search_text || '%'
      or r.json::text ilike '%' || search_text || '%'
    )
  order by r.updated_at desc
  limit greatest(1, least(max_results, 100));
$$;

grant execute on function atlas_wiki.search_records(text, integer) to authenticated;
