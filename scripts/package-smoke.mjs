import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const expectedSupabaseMigrations = [
  "20260527000100_atlas_wiki_core.sql",
  "20260527000200_atlas_wiki_rls.sql",
  "20260527000300_atlas_wiki_audit.sql",
  "20260527000400_atlas_wiki_structured_records.sql",
  "20260527000500_atlas_wiki_vector_optional.sql",
  "20260527000600_atlas_wiki_search_rpc.sql",
  "20260527000700_atlas_wiki_rag_pgvector.sql",
  "20260527000800_atlas_wiki_n9_rpc_contracts.sql",
  "20260527000900_atlas_wiki_validation_contract.sql"
];
const outputPath = args.get("output") || `release-evidence/package-smoke-v${packageVersion}.json`;
const tarball = execFileSync("npm", ["pack", "--silent"], { encoding: "utf8" }).trim().split("\n").at(-1);
if (!tarball) throw new Error("npm pack did not return a tarball");
const tarEntries = new Set(execFileSync("tar", ["-tf", tarball], { encoding: "utf8" }).trim().split(/\r?\n/));
for (const filename of expectedSupabaseMigrations) {
  if (!tarEntries.has(`package/supabase/migrations/${filename}`)) throw new Error(`Package tarball missing Supabase migration: ${filename}`);
}
if ([...tarEntries].some((entry) => entry.startsWith("package/docs/goal/"))) throw new Error("Package tarball must not include docs/goal");

const dir = mkdtempSync(join(tmpdir(), "atlas-wiki-smoke-"));
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }, null, 2));
  writeFileSync(join(dir, "handbook.md"), "Remote work requires manager approval.\n");
  execFileSync("npm", ["install", "--silent", join(process.cwd(), tarball)], { cwd: dir, stdio: "pipe" });
  const bin = join(dir, "node_modules", "atlas-wiki", "dist", "cli", "awiki.js");
  if (!readFileSync(bin, "utf8").startsWith("#!/usr/bin/env node")) throw new Error("CLI bin shebang missing");
  if ((statSync(bin).mode & 0o111) === 0) throw new Error("CLI bin is not executable");
  const installedMigrationsDir = join(dir, "node_modules", "atlas-wiki", "supabase", "migrations");
  if (!existsSync(installedMigrationsDir)) throw new Error("Installed package missing supabase/migrations");
  const installedMigrationFiles = readdirSync(installedMigrationsDir).filter((name) => name.endsWith(".sql")).sort();
  if (JSON.stringify(installedMigrationFiles) !== JSON.stringify(expectedSupabaseMigrations)) throw new Error("Installed package Supabase migration file list mismatch");
  const imported = execFileSync("node", ["--input-type=module", "-e", "import { packageInfo } from 'atlas-wiki'; console.log(packageInfo.name)"], { cwd: dir, encoding: "utf8" }).trim();
  if (imported !== "atlas-wiki") throw new Error("ESM import smoke failed");
  const releaseImported = execFileSync("node", ["--input-type=module", "-e", "import { releaseEvidenceSchema } from 'atlas-wiki/release'; console.log(releaseEvidenceSchema)"], { cwd: dir, encoding: "utf8" }).trim();
  if (releaseImported !== "atlas-wiki.release-evidence.v2") throw new Error("Release export smoke failed");
  const subpaths = execFileSync("node", ["--input-type=module", "-e", [
    "import { SqliteStore } from 'atlas-wiki/sqlite';",
    "import { MemoryStore } from 'atlas-wiki/store';",
    "import { createSupabaseStore, listSupabaseMigrationAssets, writeSupabaseMigrations } from 'atlas-wiki/supabase';",
    "import { extractStructured } from 'atlas-wiki/structured';",
    "import { builtInExtractors } from 'atlas-wiki/extractors';",
    "import { RagService } from 'atlas-wiki/rag';",
    "import { GeminiEmbeddingProvider } from 'atlas-wiki/rag/gemini';",
    "import { DeterministicEmbeddingProvider } from 'atlas-wiki/rag/testing';",
    "console.log(JSON.stringify({ sqlite: !!SqliteStore, memory: !!MemoryStore, supabase: typeof createSupabaseStore, supabaseAssets: listSupabaseMigrationAssets().length, supabaseWrite: typeof writeSupabaseMigrations, structured: typeof extractStructured, extractors: builtInExtractors.length, rag: typeof RagService, gemini: typeof GeminiEmbeddingProvider, testing: typeof DeterministicEmbeddingProvider }));"
  ].join(" ")], { cwd: dir, encoding: "utf8" }).trim();
  const parsedSubpaths = JSON.parse(subpaths);
  if (!parsedSubpaths.sqlite || !parsedSubpaths.memory || parsedSubpaths.supabase !== "function" || parsedSubpaths.supabaseAssets !== expectedSupabaseMigrations.length || parsedSubpaths.supabaseWrite !== "function" || parsedSubpaths.structured !== "function" || parsedSubpaths.extractors < 1 || parsedSubpaths.rag !== "function" || parsedSubpaths.gemini !== "function" || parsedSubpaths.testing !== "function") throw new Error("Subpath export smoke failed");
  const supabaseInit = JSON.parse(execFileSync("npx", ["awiki", "supabase", "init", "--out", join(dir, "supabase"), "--json"], { cwd: dir, encoding: "utf8" }));
  if (supabaseInit.migrations.copied.length !== expectedSupabaseMigrations.length || supabaseInit.configStatus !== "created") throw new Error("CLI Supabase init smoke failed");
  const exportedMigrations = readdirSync(join(dir, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
  if (JSON.stringify(exportedMigrations) !== JSON.stringify(expectedSupabaseMigrations)) throw new Error("CLI Supabase migration export mismatch");
  const cli = execFileSync("npx", ["awiki", "mcp", "smoke", "--root", join(dir, "wiki"), "--stdio", "--json"], { cwd: dir, encoding: "utf8" });
  const parsed = JSON.parse(cli);
  if (!parsed.tools.includes("atlas_wiki.search")) throw new Error("CLI smoke failed");
  const root = join(dir, "wiki");
  execFileSync("npx", ["awiki", "init", "--root", root, "--json"], { cwd: dir, stdio: "pipe" });
  execFileSync("npx", ["awiki", "ingest", join(dir, "handbook.md"), "--root", root, "--owner", "user:alice@example.com", "--visibility", "public", "--json"], { cwd: dir, stdio: "pipe" });
  execFileSync("npx", ["awiki", "rag", "index", "--root", root, "--provider", "testing", "--dimensions", "16", "--fallback", "testing_deterministic_embeddings", "--json"], { cwd: dir, stdio: "pipe" });
  const ragSearch = execFileSync("npx", ["awiki", "rag", "search", "manager approval", "--root", root, "--as", "user:alice@example.com", "--mode", "vector", "--provider", "testing", "--dimensions", "16", "--fallback", "testing_deterministic_embeddings", "--json"], { cwd: dir, encoding: "utf8" });
  const parsedRagSearch = JSON.parse(ragSearch);
  if (!Array.isArray(parsedRagSearch.items) || parsedRagSearch.items.length < 1 || !parsedRagSearch.items[0].citation?.quote?.includes("manager approval")) throw new Error("CLI RAG vector restart smoke failed");
  const structuredSmoke = JSON.parse(execFileSync("node", ["--input-type=module", "-e", [
    "import { AtlasWiki, MemoryStore } from 'atlas-wiki';",
    "const wiki = await AtlasWiki.open({ store: new MemoryStore() });",
    "await wiki.schema.register({ id: 'customer_profile', name: 'Customer Profile', version: '1', jsonSchema: { type: 'object', required: ['name', 'tier'] }, requiredFields: ['name', 'tier'], identityFields: ['name'], confidenceThreshold: 0.8, conflictKeys: ['name'] });",
    "const result = await wiki.ingestStructured({ title: 'Customer profile', text: 'Name: Acme Corp\\nTier: Enterprise\\nOwner: Maya Chen', schemas: ['customer_profile'], mode: 'proposal' });",
    "console.log(JSON.stringify({ objects: result.structuredObjects.length, proposals: result.proposals.length, schema: result.structuredObjects[0]?.schema_id }));"
  ].join(" ")], { cwd: dir, encoding: "utf8" }));
  if (structuredSmoke.objects < 1 || structuredSmoke.schema !== "customer_profile") throw new Error("Structured extraction package example smoke failed");
  mkdirSync("release-evidence", { recursive: true });
  writeFileSync(outputPath, JSON.stringify({
    schema: "atlas-wiki.package-smoke.v1",
    package: { name: "atlas-wiki", version: packageVersion },
    generated_at: new Date().toISOString(),
    outputPath,
    ok: true,
    tarball,
    imports: parsedSubpaths,
    supabaseMigrationExport: {
      count: exportedMigrations.length,
      filenames: exportedMigrations,
      copied: supabaseInit.migrations.copied
    },
    structured: structuredSmoke,
    rag: parsedRagSearch.metadata.rag,
    citation: parsedRagSearch.items[0].citation
  }, null, 2) + "\n");
  console.log("package smoke ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
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
