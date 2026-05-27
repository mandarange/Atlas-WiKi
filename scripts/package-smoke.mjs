import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tarball = execFileSync("npm", ["pack", "--silent"], { encoding: "utf8" }).trim().split("\n").at(-1);
if (!tarball) throw new Error("npm pack did not return a tarball");

const dir = mkdtempSync(join(tmpdir(), "atlas-wiki-smoke-"));
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }, null, 2));
  execFileSync("npm", ["install", "--silent", join(process.cwd(), tarball)], { cwd: dir, stdio: "pipe" });
  const bin = join(dir, "node_modules", "atlas-wiki", "dist", "cli", "awiki.js");
  if (!readFileSync(bin, "utf8").startsWith("#!/usr/bin/env node")) throw new Error("CLI bin shebang missing");
  if ((statSync(bin).mode & 0o111) === 0) throw new Error("CLI bin is not executable");
  const imported = execFileSync("node", ["--input-type=module", "-e", "import { packageInfo } from 'atlas-wiki'; console.log(packageInfo.name)"], { cwd: dir, encoding: "utf8" }).trim();
  if (imported !== "atlas-wiki") throw new Error("ESM import smoke failed");
  const releaseImported = execFileSync("node", ["--input-type=module", "-e", "import { releaseEvidenceSchema } from 'atlas-wiki/release'; console.log(releaseEvidenceSchema)"], { cwd: dir, encoding: "utf8" }).trim();
  if (releaseImported !== "atlas-wiki.release-evidence.v1") throw new Error("Release export smoke failed");
  const subpaths = execFileSync("node", ["--input-type=module", "-e", [
    "import { SqliteStore } from 'atlas-wiki/sqlite';",
    "import { MemoryStore } from 'atlas-wiki/store';",
    "import { createSupabaseStore } from 'atlas-wiki/supabase';",
    "import { extractStructured } from 'atlas-wiki/structured';",
    "import { builtInExtractors } from 'atlas-wiki/extractors';",
    "console.log(JSON.stringify({ sqlite: !!SqliteStore, memory: !!MemoryStore, supabase: typeof createSupabaseStore, structured: typeof extractStructured, extractors: builtInExtractors.length }));"
  ].join(" ")], { cwd: dir, encoding: "utf8" }).trim();
  const parsedSubpaths = JSON.parse(subpaths);
  if (!parsedSubpaths.sqlite || !parsedSubpaths.memory || parsedSubpaths.supabase !== "function" || parsedSubpaths.structured !== "function" || parsedSubpaths.extractors < 1) throw new Error("Subpath export smoke failed");
  const cli = execFileSync("npx", ["awiki", "mcp", "smoke", "--root", join(dir, "wiki"), "--stdio", "--json"], { cwd: dir, encoding: "utf8" });
  const parsed = JSON.parse(cli);
  if (!parsed.tools.includes("atlas_wiki.search")) throw new Error("CLI smoke failed");
  console.log("package smoke ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
