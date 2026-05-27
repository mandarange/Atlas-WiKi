import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = parseArgs(process.argv.slice(2));
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const outputPath = args.get("output") || `release-evidence/package-smoke-v${packageVersion}.json`;
const tarball = execFileSync("npm", ["pack", "--silent"], { encoding: "utf8" }).trim().split("\n").at(-1);
if (!tarball) throw new Error("npm pack did not return a tarball");

const dir = mkdtempSync(join(tmpdir(), "atlas-wiki-smoke-"));
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }, null, 2));
  writeFileSync(join(dir, "handbook.md"), "Remote work requires manager approval.\n");
  execFileSync("npm", ["install", "--silent", join(process.cwd(), tarball)], { cwd: dir, stdio: "pipe" });
  const bin = join(dir, "node_modules", "atlas-wiki", "dist", "cli", "awiki.js");
  if (!readFileSync(bin, "utf8").startsWith("#!/usr/bin/env node")) throw new Error("CLI bin shebang missing");
  if ((statSync(bin).mode & 0o111) === 0) throw new Error("CLI bin is not executable");
  const imported = execFileSync("node", ["--input-type=module", "-e", "import { packageInfo } from 'atlas-wiki'; console.log(packageInfo.name)"], { cwd: dir, encoding: "utf8" }).trim();
  if (imported !== "atlas-wiki") throw new Error("ESM import smoke failed");
  const releaseImported = execFileSync("node", ["--input-type=module", "-e", "import { releaseEvidenceSchema } from 'atlas-wiki/release'; console.log(releaseEvidenceSchema)"], { cwd: dir, encoding: "utf8" }).trim();
  if (releaseImported !== "atlas-wiki.release-evidence.v2") throw new Error("Release export smoke failed");
  const subpaths = execFileSync("node", ["--input-type=module", "-e", [
    "import { SqliteStore } from 'atlas-wiki/sqlite';",
    "import { MemoryStore } from 'atlas-wiki/store';",
    "import { createSupabaseStore } from 'atlas-wiki/supabase';",
    "import { extractStructured } from 'atlas-wiki/structured';",
    "import { builtInExtractors } from 'atlas-wiki/extractors';",
    "import { RagService } from 'atlas-wiki/rag';",
    "import { GeminiEmbeddingProvider } from 'atlas-wiki/rag/gemini';",
    "import { DeterministicEmbeddingProvider } from 'atlas-wiki/rag/testing';",
    "console.log(JSON.stringify({ sqlite: !!SqliteStore, memory: !!MemoryStore, supabase: typeof createSupabaseStore, structured: typeof extractStructured, extractors: builtInExtractors.length, rag: typeof RagService, gemini: typeof GeminiEmbeddingProvider, testing: typeof DeterministicEmbeddingProvider }));"
  ].join(" ")], { cwd: dir, encoding: "utf8" }).trim();
  const parsedSubpaths = JSON.parse(subpaths);
  if (!parsedSubpaths.sqlite || !parsedSubpaths.memory || parsedSubpaths.supabase !== "function" || parsedSubpaths.structured !== "function" || parsedSubpaths.extractors < 1 || parsedSubpaths.rag !== "function" || parsedSubpaths.gemini !== "function" || parsedSubpaths.testing !== "function") throw new Error("Subpath export smoke failed");
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
  mkdirSync("release-evidence", { recursive: true });
  writeFileSync(outputPath, JSON.stringify({
    schema: "atlas-wiki.package-smoke.v1",
    package: { name: "atlas-wiki", version: packageVersion },
    generated_at: new Date().toISOString(),
    outputPath,
    ok: true,
    tarball,
    imports: parsedSubpaths,
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
