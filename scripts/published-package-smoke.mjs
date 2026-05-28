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
const packageSpec = args.get("package") || process.env.ATLAS_WIKI_PUBLISHED_SPEC;
if (!packageSpec) throw new Error("ATLAS_WIKI_PUBLISHED_SPEC or --package atlas-wiki@<version> is required for published smoke");
const packageSpecKind = classifyPackageSpec(packageSpec);
const outputPath = args.get("output") || `release-evidence/${packageSpecKind === "registry" ? "published-package-smoke" : "local-package-install-smoke"}-v${packageVersion}.json`;
const dir = mkdtempSync(join(tmpdir(), "atlas-wiki-published-smoke-"));

try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }, null, 2));
  writeFileSync(join(dir, "handbook.md"), "Remote work requires manager approval.\n");
  execFileSync("npm", ["install", "--silent", packageSpec], { cwd: dir, stdio: "pipe" });
  const bin = join(dir, "node_modules", "atlas-wiki", "dist", "cli", "awiki.js");
  if (!readFileSync(bin, "utf8").startsWith("#!/usr/bin/env node")) throw new Error("Published CLI bin shebang missing");
  if ((statSync(bin).mode & 0o111) === 0) throw new Error("Published CLI bin is not executable");
  const installedPkg = JSON.parse(readFileSync(join(dir, "node_modules", "atlas-wiki", "package.json"), "utf8"));
  if (installedPkg.version !== packageVersion) throw new Error(`Published smoke installed atlas-wiki@${installedPkg.version}, expected ${packageVersion}`);
  const installedMigrationsDir = join(dir, "node_modules", "atlas-wiki", "supabase", "migrations");
  if (!existsSync(installedMigrationsDir)) throw new Error("Published package missing supabase/migrations");
  const installedMigrationFiles = readdirSync(installedMigrationsDir).filter((name) => name.endsWith(".sql")).sort();
  if (JSON.stringify(installedMigrationFiles) !== JSON.stringify(expectedSupabaseMigrations)) throw new Error("Published package Supabase migration file list mismatch");
  const imported = execFileSync("node", ["--input-type=module", "-e", [
    "import { AtlasWiki, packageInfo } from 'atlas-wiki';",
    "import { createReadonlyAtlasWikiServer } from 'atlas-wiki/mcp';",
    "import { createAdminAtlasWikiServer } from 'atlas-wiki/mcp/admin';",
    "import { createSupabaseStore, listSupabaseMigrationAssets, writeSupabaseMigrations } from 'atlas-wiki/supabase';",
    "import { extractStructured } from 'atlas-wiki/structured';",
    "import { MemoryStore } from 'atlas-wiki/store';",
    "import { SqliteStore } from 'atlas-wiki/sqlite';",
    "import { RagService } from 'atlas-wiki/rag';",
    "import { GeminiEmbeddingProvider } from 'atlas-wiki/rag/gemini';",
    "import { DeterministicEmbeddingProvider } from 'atlas-wiki/rag/testing';",
    "console.log(JSON.stringify({ name: packageInfo.name, sdk: typeof AtlasWiki.open, readonly: !!createReadonlyAtlasWikiServer, admin: !!createAdminAtlasWikiServer, supabase: typeof createSupabaseStore, supabaseAssets: listSupabaseMigrationAssets().length, supabaseWrite: typeof writeSupabaseMigrations, structured: typeof extractStructured, memory: !!MemoryStore, sqlite: !!SqliteStore, rag: typeof RagService, gemini: typeof GeminiEmbeddingProvider, testing: typeof DeterministicEmbeddingProvider }));"
  ].join(" ")], { cwd: dir, encoding: "utf8" }).trim();
  const parsed = JSON.parse(imported);
  if (parsed.name !== "atlas-wiki" || parsed.sdk !== "function" || !parsed.readonly || !parsed.admin) throw new Error("Published package import smoke failed");
  if (parsed.supabase !== "function" || parsed.supabaseAssets !== expectedSupabaseMigrations.length || parsed.supabaseWrite !== "function" || parsed.structured !== "function" || !parsed.memory || !parsed.sqlite) throw new Error("Published backend subpath import smoke failed");
  if (parsed.rag !== "function" || parsed.gemini !== "function" || parsed.testing !== "function") throw new Error("Published RAG subpath import smoke failed");
  const releaseExport = execFileSync("node", ["--input-type=module", "-e", "import { releaseEvidenceSchema } from 'atlas-wiki/release'; console.log(releaseEvidenceSchema)"], { cwd: dir, encoding: "utf8" }).trim();
  if (releaseExport !== "atlas-wiki.release-evidence.v2") throw new Error("Published release export smoke failed");
  const root = join(dir, "wiki");
  for (const args of [
    ["awiki", "init", "--root", root, "--json"],
    ["awiki", "ingest", join(dir, "handbook.md"), "--root", root, "--owner", "user:alice@example.com", "--visibility", "public", "--json"],
    ["awiki", "search", "remote work", "--root", root, "--as", "user:alice@example.com", "--json"],
    ["awiki", "context-pack", "remote work", "--root", root, "--as", "user:alice@example.com", "--json"],
    ["awiki", "validate", "--root", root, "--json"],
    ["awiki", "audit", "verify", "--root", root, "--json"]
  ]) {
    execFileSync("npx", args, { cwd: dir, stdio: "pipe" });
  }
  const supabaseInit = JSON.parse(execFileSync("npx", ["awiki", "supabase", "init", "--out", join(dir, "supabase"), "--json"], { cwd: dir, encoding: "utf8" }));
  if (supabaseInit.migrations.copied.length !== expectedSupabaseMigrations.length || supabaseInit.configStatus !== "created") throw new Error("Published CLI Supabase init smoke failed");
  const exportedMigrations = readdirSync(join(dir, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
  if (JSON.stringify(exportedMigrations) !== JSON.stringify(expectedSupabaseMigrations)) throw new Error("Published CLI Supabase migration export mismatch");
  execFileSync("npx", ["awiki", "rag", "index", "--root", root, "--provider", "testing", "--dimensions", "16", "--fallback", "testing_deterministic_embeddings", "--json"], { cwd: dir, stdio: "pipe" });
  const ragSearch = execFileSync("npx", ["awiki", "rag", "search", "manager approval", "--root", root, "--as", "user:alice@example.com", "--mode", "vector", "--provider", "testing", "--dimensions", "16", "--fallback", "testing_deterministic_embeddings", "--json"], { cwd: dir, encoding: "utf8" });
  const parsedRagSearch = JSON.parse(ragSearch);
  if (!Array.isArray(parsedRagSearch.items) || parsedRagSearch.items.length < 1 || !parsedRagSearch.items[0].citation?.quote?.includes("manager approval")) throw new Error("Published CLI RAG vector restart smoke failed");
  const evidence = { schema: "atlas-wiki.published-package-smoke.v1", package: { name: "atlas-wiki", version: packageVersion }, generated_at: new Date().toISOString(), outputPath, ok: true, packageSpec, sourceKind: packageSpecKind === "registry" ? "published_registry" : "local_or_custom_package_spec", publishVerified: packageSpecKind === "registry", imports: parsed, releaseExport, supabaseMigrationExport: { count: exportedMigrations.length, filenames: exportedMigrations, copied: supabaseInit.migrations.copied }, rag: parsedRagSearch.metadata.rag, citation: parsedRagSearch.items[0].citation };
  mkdirSync("release-evidence", { recursive: true });
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
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

function classifyPackageSpec(spec) {
  return /^atlas-wiki@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(spec) ? "registry" : "local";
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function parseSemver(version) {
  if (typeof version !== "string") return null;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1, 4).map((part) => Number(part));
}
