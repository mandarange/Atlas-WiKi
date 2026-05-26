import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tarball = execFileSync("npm", ["pack", "--silent"], { encoding: "utf8" }).trim().split("\n").at(-1);
if (!tarball) throw new Error("npm pack did not return a tarball");

const dir = mkdtempSync(join(tmpdir(), "atlas-wiki-smoke-"));
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }, null, 2));
  execFileSync("npm", ["install", "--silent", join(process.cwd(), tarball)], { cwd: dir, stdio: "pipe" });
  const imported = execFileSync("node", ["--input-type=module", "-e", "import { packageInfo } from 'atlas-wiki'; console.log(packageInfo.name)"], { cwd: dir, encoding: "utf8" }).trim();
  if (imported !== "atlas-wiki") throw new Error("ESM import smoke failed");
  const cli = execFileSync("npx", ["awiki", "mcp", "smoke", "--root", join(dir, "wiki"), "--stdio", "--json"], { cwd: dir, encoding: "utf8" });
  const parsed = JSON.parse(cli);
  if (!parsed.tools.includes("atlas_wiki.search")) throw new Error("CLI smoke failed");
  console.log("package smoke ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
