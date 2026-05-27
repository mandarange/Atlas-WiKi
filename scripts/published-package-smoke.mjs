import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const outputPath = args.get("output") || `release-evidence/published-package-smoke-v${packageVersion}.json`;
const packageSpec = args.get("package") || process.env.ATLAS_WIKI_PUBLISHED_SPEC;
if (!packageSpec) throw new Error("ATLAS_WIKI_PUBLISHED_SPEC or --package atlas-wiki@<version> is required for published smoke");
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
  const hasBackendExports = Boolean(installedPkg.exports?.["./supabase"] && installedPkg.exports?.["./structured"] && installedPkg.exports?.["./store"] && installedPkg.exports?.["./sqlite"]);
  const hasRagExports = Boolean(installedPkg.exports?.["./rag"] && installedPkg.exports?.["./rag/gemini"] && installedPkg.exports?.["./rag/testing"]);
  const imported = execFileSync("node", ["--input-type=module", "-e", [
    "import { AtlasWiki, packageInfo } from 'atlas-wiki';",
    "import { createReadonlyAtlasWikiServer } from 'atlas-wiki/mcp';",
    "import { createAdminAtlasWikiServer } from 'atlas-wiki/mcp/admin';",
    hasBackendExports ? "import { createSupabaseStore } from 'atlas-wiki/supabase'; import { extractStructured } from 'atlas-wiki/structured'; import { MemoryStore } from 'atlas-wiki/store'; import { SqliteStore } from 'atlas-wiki/sqlite';" : "",
    hasRagExports ? "import { RagService } from 'atlas-wiki/rag'; import { GeminiEmbeddingProvider } from 'atlas-wiki/rag/gemini'; import { DeterministicEmbeddingProvider } from 'atlas-wiki/rag/testing';" : "",
    "console.log(JSON.stringify({ name: packageInfo.name, sdk: typeof AtlasWiki.open, readonly: !!createReadonlyAtlasWikiServer, admin: !!createAdminAtlasWikiServer, supabase: typeof createSupabaseStore === 'undefined' ? 'baseline-missing' : typeof createSupabaseStore, structured: typeof extractStructured === 'undefined' ? 'baseline-missing' : typeof extractStructured, memory: typeof MemoryStore === 'undefined' ? false : !!MemoryStore, sqlite: typeof SqliteStore === 'undefined' ? false : !!SqliteStore, rag: typeof RagService === 'undefined' ? 'baseline-missing' : typeof RagService, gemini: typeof GeminiEmbeddingProvider === 'undefined' ? 'baseline-missing' : typeof GeminiEmbeddingProvider, testing: typeof DeterministicEmbeddingProvider === 'undefined' ? 'baseline-missing' : typeof DeterministicEmbeddingProvider }));"
  ].join(" ")], { cwd: dir, encoding: "utf8" }).trim();
  const parsed = JSON.parse(imported);
  if (parsed.name !== "atlas-wiki" || parsed.sdk !== "function" || !parsed.readonly || !parsed.admin) throw new Error("Published package import smoke failed");
  if (hasBackendExports && (parsed.supabase !== "function" || parsed.structured !== "function" || !parsed.memory || !parsed.sqlite)) throw new Error("Published backend subpath import smoke failed");
  if (hasRagExports && (parsed.rag !== "function" || parsed.gemini !== "function" || parsed.testing !== "function")) throw new Error("Published RAG subpath import smoke failed");
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
  execFileSync("npx", ["awiki", "rag", "index", "--root", root, "--provider", "testing", "--dimensions", "16", "--fallback", "testing_deterministic_embeddings", "--json"], { cwd: dir, stdio: "pipe" });
  const ragSearch = execFileSync("npx", ["awiki", "rag", "search", "manager approval", "--root", root, "--as", "user:alice@example.com", "--mode", "vector", "--provider", "testing", "--dimensions", "16", "--fallback", "testing_deterministic_embeddings", "--json"], { cwd: dir, encoding: "utf8" });
  const parsedRagSearch = JSON.parse(ragSearch);
  if (!Array.isArray(parsedRagSearch.items) || parsedRagSearch.items.length < 1 || !parsedRagSearch.items[0].citation?.quote?.includes("manager approval")) throw new Error("Published CLI RAG vector restart smoke failed");
  const evidence = { schema: "atlas-wiki.published-package-smoke.v1", package: { name: "atlas-wiki", version: packageVersion }, generated_at: new Date().toISOString(), outputPath, ok: true, packageSpec, imports: parsed, releaseExport, rag: parsedRagSearch.metadata.rag, citation: parsedRagSearch.items[0].citation };
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
