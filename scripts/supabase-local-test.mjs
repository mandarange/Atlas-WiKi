import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const args = parseArgs(process.argv.slice(2));
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const evidencePath = args.get("output") || `release-evidence/supabase-local-smoke-v${packageVersion}.json`;

if (process.env.SUPABASE_LOCAL_TESTS !== "1") {
  writeEvidence({
    ok: false,
    status: "skipped",
    reason: "SUPABASE_LOCAL_TESTS is not set to 1",
    assertions: []
  });
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
applyLocalContractMigrations(activeContainer);

const testId = `atw_local_${Date.now()}`;
const profileId = `${testId}_profile`;
const publicRecordId = `${testId}_public`;
const privateRecordId = `${testId}_private`;
const internalRecordId = `${testId}_internal`;
const publicChunkId = `${testId}_public_chunk`;
const privateChunkId = `${testId}_private_chunk`;
const internalChunkId = `${testId}_internal_chunk`;

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
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'atlas_wiki' and p.proname = 'validate_contract') then
    raise exception 'atlas_wiki.validate_contract missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'atlas_wiki' and p.proname = 'migration_report') then
    raise exception 'atlas_wiki.migration_report missing';
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

do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"user-alpha","role":"authenticated","atlas_actor_id":"user-alpha","app_metadata":{"teams":["team-alpha"],"roles":["editor"]}}', false);
end $$;

insert into atlas_wiki.records(id, schema, kind, status, json, content_hash, revision, created_at, updated_at, created_by, updated_by)
values (
  '${internalRecordId}',
  'atlas.wiki.source.v1',
  'source',
  'active',
  '{"title":"ATW local internal source","acl":{"visibility":"internal","grants":[{"principal_type":"authenticated","principal_id":"*","permission":"read","effect":"allow"},{"principal_type":"user","principal_id":"user-alpha","permission":"admin","effect":"allow"}]}}'::jsonb,
  'hash-internal',
  1,
  now(),
  now(),
  '{"id":"user-alpha","type":"user"}'::jsonb,
  '{"id":"user-alpha","type":"user"}'::jsonb
);
insert into atlas_wiki.record_acl(record_id, principal_type, principal_id, effect, permission)
values ('${internalRecordId}', 'authenticated', '*', 'allow', 'read');
insert into atlas_wiki.sources(id, source_type, title, uri, owner_id, content_hash, extracted_text_ref, stale_after, updated_at, metadata)
values ('${internalRecordId}', 'manual', 'ATW local internal source', null, 'user-alpha', 'hash-internal', null, null, now(), '{}'::jsonb);
insert into atlas_wiki.chunks(id, source_id, ordinal, text, text_hash, locator_json, created_at, metadata)
values ('${internalChunkId}', '${internalRecordId}', 0, 'internal gamma release evidence chunk', 'hash-internal-chunk', null, now(), '{}'::jsonb);

do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"user-beta","role":"authenticated","atlas_actor_id":"user-beta","app_metadata":{"teams":["team-beta"],"roles":["editor"]}}', false);
end $$;

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

with vec as (
  select
    '[' || string_agg(case when n = 1 then '0.9' when n = 3 then '0.1' else '0' end, ',' order by n) || ']' as vector_text,
    jsonb_agg(case when n = 1 then 0.9 when n = 3 then 0.1 else 0 end order by n) as vector_json
  from generate_series(1, 1536) as n
)
insert into atlas_wiki.embeddings(id, chunk_id, profile_id, provider_id, model, dimensions, content_hash, embedding, vector_json, created_at, stale_at)
select '${internalChunkId}_embedding', '${internalChunkId}', '${profileId}', 'local-test', 'local-1536', 1536, 'hash-internal-chunk', vector_text::extensions.vector(1536), vector_json, now(), null
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
  internal_chunk_hits integer;
  internal_vector_hits integer;
  validation_findings integer;
  migration_rows integer;
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

  select count(*) into internal_chunk_hits
  from atlas_wiki.chunk_search('internal gamma', 'user-alpha', array['team-alpha'], 10)
  where source_id = '${internalRecordId}';
  if internal_chunk_hits <> 1 then
    raise exception 'chunk_search did not return authenticated internal chunk';
  end if;

  with query_vec as (
    select '[' || string_agg(case when n = 1 then '1' else '0' end, ',' order by n) || ']' as vector_text
    from generate_series(1, 1536) as n
  )
  select count(*) into alpha_private_hits
  from atlas_wiki.rag_search((select vector_text::extensions.vector(1536) from query_vec), 'user-alpha'::text, array['team-alpha']::text[], 10, null::text)
  where source_id = '${privateRecordId}';
  if alpha_private_hits <> 0 then
    raise exception 'rag_search leaked private chunk to user-alpha';
  end if;

  with query_vec as (
    select '[' || string_agg(case when n = 1 then '1' else '0' end, ',' order by n) || ']' as vector_text
    from generate_series(1, 1536) as n
  )
  select count(*) into beta_private_hits
  from atlas_wiki.rag_search((select vector_text::extensions.vector(1536) from query_vec), 'user-beta'::text, array['team-beta']::text[], 10, null::text)
  where source_id = '${privateRecordId}';
  if beta_private_hits <> 1 then
    raise exception 'rag_search did not return ACL-authorized private chunk to user-beta';
  end if;

  with query_vec as (
    select '[' || string_agg(case when n = 1 then '1' else '0' end, ',' order by n) || ']' as vector_text
    from generate_series(1, 1536) as n
  )
  select count(*) into internal_vector_hits
  from atlas_wiki.rag_search((select vector_text::extensions.vector(1536) from query_vec), 'user-alpha'::text, array['team-alpha']::text[], 10, null::text)
  where source_id = '${internalRecordId}';
  if internal_vector_hits <> 1 then
    raise exception 'rag_search did not return authenticated internal chunk';
  end if;

  begin
    perform *
    from atlas_wiki.upsert_record_cas(
      '{
        "schema":"atlas.wiki.source.v1",
        "kind":"source",
        "id":"${privateRecordId}",
        "status":"active",
        "title":"unauthorized alpha write",
        "acl":{"visibility":"private","grants":[{"principal_type":"user","principal_id":"user-beta","permission":"admin","effect":"allow"}]},
        "content_hash":"hash-private-updated",
        "revision":1,
        "created_at":"2026-05-27T00:00:00.000Z",
        "updated_at":"2026-05-27T00:00:00.000Z",
        "source_type":"manual",
        "freshness":{}
      }'::jsonb,
      1,
      false
    );
    raise exception 'upsert_record_cas allowed unauthorized user-alpha update';
  exception
    when insufficient_privilege then
      null;
  end;

  select count(*) into validation_findings from atlas_wiki.validate_contract();
  if validation_findings <> 0 then
    raise exception 'validate_contract returned findings';
  end if;

  select count(*) into migration_rows
  from atlas_wiki.migration_report(array[
    '20260527000100_atlas_wiki_core',
    '20260527000200_atlas_wiki_rls',
    '20260527000300_atlas_wiki_audit',
    '20260527000400_atlas_wiki_structured_records',
    '20260527000500_atlas_wiki_vector_optional',
    '20260527000600_atlas_wiki_search_rpc',
    '20260527000700_atlas_wiki_rag_pgvector',
    '20260527000800_atlas_wiki_n9_rpc_contracts',
    '20260527000900_atlas_wiki_validation_contract'
  ]);
  if migration_rows <> 9 then
    raise exception 'migration_report did not return expected rows';
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
writeEvidence({
  ok: true,
  status: "passed",
  container: activeContainer,
  result: output,
  assertions: [
    "atlas_wiki.records table exists",
    "atlas_wiki.chunks table exists",
    "atlas_wiki.embedding_profiles table exists",
    "atlas_wiki.embeddings table exists",
    "pgvector extension exists",
    "atlas_wiki.rag_search RPC exists",
    "atlas_wiki.validate_contract RPC exists",
    "atlas_wiki.migration_report RPC exists",
    "records RLS hides private source from unauthorized actor",
    "chunk_search returns authenticated internal chunk",
    "rag_search hides unauthorized private chunk",
    "rag_search returns authorized private chunk",
    "rag_search returns authenticated internal chunk",
    "upsert_record_cas rejects unauthorized updates",
    "validate_contract returns no findings",
    "migration_report returns expected migration rows"
  ]
});
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

function applyLocalContractMigrations(container) {
  const sql = [
    "supabase/migrations/20260527000800_atlas_wiki_n9_rpc_contracts.sql",
    "supabase/migrations/20260527000900_atlas_wiki_validation_contract.sql"
  ].map((path) => readFileSync(path, "utf8")).join("\n\n");
  execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "--quiet"], {
    encoding: "utf8",
    input: sql,
    maxBuffer: 1024 * 1024 * 20,
    stdio: ["pipe", "pipe", "pipe"]
  });
}

function fail(message) {
  writeEvidence({
    ok: false,
    status: "failed",
    error: message,
    assertions: []
  });
  console.error(message);
  process.exit(1);
}

function writeEvidence(details) {
  mkdirSync("release-evidence", { recursive: true });
  writeFileSync(evidencePath, JSON.stringify({
    schema: "atlas-wiki.supabase-local-smoke.v1",
    package: { name: "atlas-wiki", version: packageVersion },
    generated_at: new Date().toISOString(),
    outputPath: evidencePath,
    command: process.env.SUPABASE_LOCAL_TESTS === "1" ? "SUPABASE_LOCAL_TESTS=1 npm run test:supabase:local" : "npm run test:supabase:local (skipped because SUPABASE_LOCAL_TESTS is not 1)",
    ...details
  }, null, 2) + "\n");
}

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      flags.set(key, value);
      i += 1;
    } else {
      flags.set(key, "1");
    }
  }
  return flags;
}
