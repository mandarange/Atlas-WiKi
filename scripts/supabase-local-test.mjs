import { execFileSync } from "node:child_process";
import { basename } from "node:path";

if (process.env.SUPABASE_LOCAL_TESTS !== "1") {
  console.log("supabase local tests skipped (set SUPABASE_LOCAL_TESTS=1 for local service mode)");
  process.exit(0);
}

const projectName = basename(process.cwd());
const containerName = findDatabaseContainer(projectName);
if (!containerName) {
  run("supabase", ["start", "--ignore-health-check"], "start local Supabase");
}

const activeContainer = findDatabaseContainer(projectName);
if (!activeContainer) fail("Supabase database container is not running after `supabase start`");

const testId = `atw_local_${Date.now()}`;
const profileId = `${testId}_profile`;
const publicRecordId = `${testId}_public`;
const privateRecordId = `${testId}_private`;
const publicChunkId = `${testId}_public_chunk`;
const privateChunkId = `${testId}_private_chunk`;

const sql = `
set client_min_messages to warning;
set row_security = on;

do $$
begin
  if to_regclass('atlas_wiki.records') is null then
    raise exception 'atlas_wiki.records missing';
  end if;
  if to_regclass('atlas_wiki.chunks') is null then
    raise exception 'atlas_wiki.chunks missing';
  end if;
  if to_regclass('atlas_wiki.embedding_profiles') is null then
    raise exception 'atlas_wiki.embedding_profiles missing';
  end if;
  if to_regclass('atlas_wiki.embeddings') is null then
    raise exception 'atlas_wiki.embeddings missing';
  end if;
  if not exists (select 1 from pg_extension where extname = 'vector') then
    raise exception 'pgvector extension missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'atlas_wiki' and p.proname = 'rag_search') then
    raise exception 'atlas_wiki.rag_search missing';
  end if;
end $$;

set role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"user-alpha","role":"authenticated","atlas_actor_id":"user-alpha","app_metadata":{"teams":["team-alpha"],"roles":["editor"]}}', false);
end $$;

insert into atlas_wiki.records(id, schema, kind, status, json, content_hash, revision, created_at, updated_at, created_by, updated_by)
values (
  '${publicRecordId}',
  'atlas.wiki.source.v1',
  'source',
  'active',
  '{"title":"ATW local public source","acl":{"visibility":"public","grants":[{"principal_type":"user","principal_id":"user-alpha","permission":"admin","effect":"allow"}]}}'::jsonb,
  'hash-public',
  1,
  now(),
  now(),
  '{"id":"user-alpha","type":"user"}'::jsonb,
  '{"id":"user-alpha","type":"user"}'::jsonb
);
insert into atlas_wiki.sources(id, source_type, title, uri, owner_id, content_hash, extracted_text_ref, stale_after, updated_at, metadata)
values ('${publicRecordId}', 'manual', 'ATW local public source', null, 'user-alpha', 'hash-public', null, null, now(), '{}'::jsonb);
insert into atlas_wiki.chunks(id, source_id, ordinal, text, text_hash, locator_json, created_at, metadata)
values ('${publicChunkId}', '${publicRecordId}', 0, 'public alpha release evidence chunk', 'hash-public-chunk', null, now(), '{}'::jsonb);

insert into atlas_wiki.embedding_profiles(id, provider_id, model, dimensions, prompt_policy, metadata)
values ('${profileId}', 'local-test', 'local-1536', 1536, 'local smoke', '{}'::jsonb);

with vec as (
  select
    '[' || string_agg(case when n = 1 then '1' else '0' end, ',' order by n) || ']' as vector_text,
    jsonb_agg(case when n = 1 then 1 else 0 end order by n) as vector_json
  from generate_series(1, 1536) as n
)
insert into atlas_wiki.embeddings(id, chunk_id, profile_id, provider_id, model, dimensions, content_hash, embedding, vector_json, created_at, stale_at)
select '${publicChunkId}_embedding', '${publicChunkId}', '${profileId}', 'local-test', 'local-1536', 1536, 'hash-public-chunk', vector_text::extensions.vector(1536), vector_json, now(), null
from vec;

do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"user-beta","role":"authenticated","atlas_actor_id":"user-beta","app_metadata":{"teams":["team-beta"],"roles":["editor"]}}', false);
end $$;

insert into atlas_wiki.records(id, schema, kind, status, json, content_hash, revision, created_at, updated_at, created_by, updated_by)
values (
  '${privateRecordId}',
  'atlas.wiki.source.v1',
  'source',
  'active',
  '{"title":"ATW local private source","acl":{"visibility":"private","grants":[{"principal_type":"user","principal_id":"user-beta","permission":"admin","effect":"allow"}]}}'::jsonb,
  'hash-private',
  1,
  now(),
  now(),
  '{"id":"user-beta","type":"user"}'::jsonb,
  '{"id":"user-beta","type":"user"}'::jsonb
);
insert into atlas_wiki.record_acl(record_id, principal_type, principal_id, effect, permission)
values ('${privateRecordId}', 'user', 'user-beta', 'allow', 'read');
insert into atlas_wiki.sources(id, source_type, title, uri, owner_id, content_hash, extracted_text_ref, stale_after, updated_at, metadata)
values ('${privateRecordId}', 'manual', 'ATW local private source', null, 'user-beta', 'hash-private', null, null, now(), '{}'::jsonb);
insert into atlas_wiki.chunks(id, source_id, ordinal, text, text_hash, locator_json, created_at, metadata)
values ('${privateChunkId}', '${privateRecordId}', 0, 'private beta release evidence chunk', 'hash-private-chunk', null, now(), '{}'::jsonb);

with vec as (
  select
    '[' || string_agg(case when n = 1 then '0.95' when n = 2 then '0.05' else '0' end, ',' order by n) || ']' as vector_text,
    jsonb_agg(case when n = 1 then 0.95 when n = 2 then 0.05 else 0 end order by n) as vector_json
  from generate_series(1, 1536) as n
)
insert into atlas_wiki.embeddings(id, chunk_id, profile_id, provider_id, model, dimensions, content_hash, embedding, vector_json, created_at, stale_at)
select '${privateChunkId}_embedding', '${privateChunkId}', '${profileId}', 'local-test', 'local-1536', 1536, 'hash-private-chunk', vector_text::extensions.vector(1536), vector_json, now(), null
from vec;

do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"user-alpha","role":"authenticated","atlas_actor_id":"user-alpha","app_metadata":{"teams":["team-alpha"],"roles":["editor"]}}', false);
end $$;

do $$
declare
  visible_public integer;
  visible_private integer;
  chunk_count integer;
  alpha_private_hits integer;
  beta_private_hits integer;
begin
  select count(*) into visible_public from atlas_wiki.records where id = '${publicRecordId}';
  if visible_public <> 1 then
    raise exception 'public record not visible to authenticated actor';
  end if;

  select count(*) into visible_private from atlas_wiki.records where id = '${privateRecordId}';
  if visible_private <> 0 then
    raise exception 'private record leaked through records RLS';
  end if;

  select count(*) into chunk_count from atlas_wiki.chunks where source_id = '${publicRecordId}';
  if chunk_count <> 1 then
    raise exception 'chunk row not visible for public source';
  end if;

  with query_vec as (
    select '[' || string_agg(case when n = 1 then '1' else '0' end, ',' order by n) || ']' as vector_text
    from generate_series(1, 1536) as n
  )
  select count(*) into alpha_private_hits
  from atlas_wiki.rag_search((select vector_text::extensions.vector(1536) from query_vec), 'user-alpha', array['team-alpha'], 10)
  where source_id = '${privateRecordId}';
  if alpha_private_hits <> 0 then
    raise exception 'rag_search leaked private chunk to user-alpha';
  end if;

  with query_vec as (
    select '[' || string_agg(case when n = 1 then '1' else '0' end, ',' order by n) || ']' as vector_text
    from generate_series(1, 1536) as n
  )
  select count(*) into beta_private_hits
  from atlas_wiki.rag_search((select vector_text::extensions.vector(1536) from query_vec), 'user-beta', array['team-beta'], 10)
  where source_id = '${privateRecordId}';
  if beta_private_hits <> 1 then
    raise exception 'rag_search did not return ACL-authorized private chunk to user-beta';
  end if;
end $$;

reset role;
select 'supabase local rag/rls smoke ok' as result;
`;

const output = execFileSync("docker", ["exec", "-i", activeContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-A", "-t", "--quiet"], {
  encoding: "utf8",
  input: sql,
  maxBuffer: 1024 * 1024 * 20,
  stdio: ["pipe", "pipe", "pipe"]
}).trim();

if (!output.includes("supabase local rag/rls smoke ok")) {
  fail("Supabase local smoke did not report success");
}
console.log(output);

function run(command, args, label) {
  try {
    execFileSync(command, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 20, stdio: "pipe" });
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim();
    fail(`${label} failed${output ? `:\n${output}` : ""}`);
  }
}

function findDatabaseContainer(project) {
  const names = execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n").filter(Boolean);
  return names.find((name) => name === `supabase_db_${project}`) ?? names.find((name) => name.startsWith("supabase_db_"));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
