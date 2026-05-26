import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.name !== "atlas-wiki") throw new Error("Package name mismatch");
if (pkg.type !== "module") throw new Error("Package must be ESM");
if (Object.hasOwn(pkg.publishConfig ?? {}, "provenance")) throw new Error("publishConfig.provenance must not block plain npm publish");
if (pkg.scripts?.["publish:local"] || pkg.scripts?.["publish:local:dry-run"]) throw new Error("Use official npm publish, not publish:local wrappers");
if (pkg.scripts?.["package:dry-run"] !== "npm publish --dry-run") throw new Error("package:dry-run must verify plain npm publish");

for (const path of ["dist/index.js", "dist/index.d.ts", "dist/cli/awiki.js", "dist/mcp/server.d.ts", "dist/mcp/admin.d.ts"]) {
  if (!existsSync(path)) throw new Error(`Missing build output: ${path}`);
}

for (const entry of [".", "./sdk", "./cli", "./mcp", "./mcp/admin", "./schemas"]) {
  if (!pkg.exports?.[entry]) throw new Error(`Missing package export: ${entry}`);
}

const sourceJs = execFileSync("find", ["src", "-name", "*.js"], { encoding: "utf8" }).trim();
if (sourceJs) throw new Error(`src/**/*.js is forbidden: ${sourceJs}`);

console.log("package verify ok");
