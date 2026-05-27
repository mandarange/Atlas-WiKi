import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageSpec = process.env.ATLAS_WIKI_PUBLISHED_SPEC || "atlas-wiki";
const dir = mkdtempSync(join(tmpdir(), "atlas-wiki-published-smoke-"));

try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }, null, 2));
  writeFileSync(join(dir, "handbook.md"), "Remote work requires manager approval.\n");
  execFileSync("npm", ["install", "--silent", packageSpec], { cwd: dir, stdio: "pipe" });
  const bin = join(dir, "node_modules", "atlas-wiki", "dist", "cli", "awiki.js");
  if (!readFileSync(bin, "utf8").startsWith("#!/usr/bin/env node")) throw new Error("Published CLI bin shebang missing");
  if ((statSync(bin).mode & 0o111) === 0) throw new Error("Published CLI bin is not executable");
  const imported = execFileSync("node", ["--input-type=module", "-e", [
    "import { AtlasWiki, packageInfo } from 'atlas-wiki';",
    "import { createReadonlyAtlasWikiServer } from 'atlas-wiki/mcp';",
    "import { createAdminAtlasWikiServer } from 'atlas-wiki/mcp/admin';",
    "console.log(JSON.stringify({ name: packageInfo.name, sdk: typeof AtlasWiki.open, readonly: !!createReadonlyAtlasWikiServer, admin: !!createAdminAtlasWikiServer }));"
  ].join(" ")], { cwd: dir, encoding: "utf8" }).trim();
  const parsed = JSON.parse(imported);
  if (parsed.name !== "atlas-wiki" || parsed.sdk !== "function" || !parsed.readonly || !parsed.admin) throw new Error("Published package import smoke failed");
  const installedPkg = JSON.parse(readFileSync(join(dir, "node_modules", "atlas-wiki", "package.json"), "utf8"));
  let releaseExport = "not_published_in_baseline";
  if (installedPkg.exports?.["./release"]) {
    releaseExport = execFileSync("node", ["--input-type=module", "-e", "import { releaseEvidenceSchema } from 'atlas-wiki/release'; console.log(releaseEvidenceSchema)"], { cwd: dir, encoding: "utf8" }).trim();
    if (releaseExport !== "atlas-wiki.release-evidence.v1") throw new Error("Published release export smoke failed");
  }
  const root = join(dir, "wiki");
  for (const args of [
    ["awiki", "init", "--root", root, "--json"],
    ["awiki", "ingest", join(dir, "handbook.md"), "--root", root, "--owner", "team:ops", "--visibility", "internal", "--json"],
    ["awiki", "search", "remote work", "--root", root, "--as", "user:alice@example.com", "--json"],
    ["awiki", "context-pack", "remote work", "--root", root, "--as", "user:alice@example.com", "--json"],
    ["awiki", "validate", "--root", root, "--json"],
    ["awiki", "audit", "verify", "--root", root, "--json"]
  ]) {
    execFileSync("npx", args, { cwd: dir, stdio: "pipe" });
  }
  console.log(JSON.stringify({ ok: true, packageSpec, imports: parsed, releaseExport }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
