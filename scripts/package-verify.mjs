import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
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
const { packageInfo } = await import(pathToFileURL(resolve("dist/package-info.js")).href);
if (pkg.name !== "atlas-wiki") throw new Error("Package name mismatch");
if (packageInfo.name !== pkg.name || packageInfo.version !== pkg.version) throw new Error("Package info drift");
if (pkg.type !== "module") throw new Error("Package must be ESM");
if (Object.hasOwn(pkg.publishConfig ?? {}, "provenance")) throw new Error("publishConfig.provenance must not block plain npm publish");
if (pkg.scripts?.["publish:local"] || pkg.scripts?.["publish:local:dry-run"]) throw new Error("Use official npm publish, not publish:local wrappers");
if (!pkg.scripts?.["package:dry-run"]?.includes("package-dry-run.mjs")) throw new Error("package:dry-run must verify npm publish dry-run through the reproducibility wrapper");
if (!pkg.files?.includes("supabase/migrations")) throw new Error("package files must include supabase/migrations for npm-only Supabase setup");
if (!pkg.files?.includes("examples")) throw new Error("package files must include examples");
if (pkg.files?.includes("docs/goal")) throw new Error("docs/goal must not be included in package files");
if (!existsSync("examples") || readdirSync("examples").length === 0) throw new Error("examples package asset is missing or empty");
for (const filename of expectedSupabaseMigrations) {
  if (!existsSync(`supabase/migrations/${filename}`)) throw new Error(`Missing Supabase package migration asset: ${filename}`);
}

for (const path of ["dist/index.js", "dist/index.d.ts", "dist/cli/awiki.js", "dist/mcp/server.d.ts", "dist/mcp/admin.d.ts"]) {
  if (!existsSync(path)) throw new Error(`Missing build output: ${path}`);
}

for (const entry of [".", "./sdk", "./cli", "./mcp", "./mcp/admin", "./store", "./sqlite", "./supabase", "./structured", "./extractors", "./release", "./schemas"]) {
  if (!pkg.exports?.[entry]) throw new Error(`Missing package export: ${entry}`);
}

const sourceJs = execFileSync("find", ["src", "-name", "*.js"], { encoding: "utf8" }).trim();
if (sourceJs) throw new Error(`src/**/*.js is forbidden: ${sourceJs}`);

console.log("package verify ok");
