import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
const srcJs = files.filter((file) => file.startsWith("src/") && file.endsWith(".js"));
if (srcJs.length) fail(`Hand-authored JavaScript is forbidden in src: ${srcJs.join(", ")}`);

const coreFiles = files.filter((file) => file.startsWith("src/core/") || file.startsWith("src/store/") || file.startsWith("src/db/"));
const forbidden = [new RegExp("\\\\.sneako" + "scope"), new RegExp("\\\\.her" + "mes"), /\bHermes\b/, /\bCodex\b/, /\bSKS\b/];
for (const file of coreFiles) {
  const text = readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) fail(`Forbidden adapter-specific literal ${pattern} in ${file}`);
  }
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
for (const key of [".", "./sdk", "./cli", "./mcp", "./schemas"]) {
  if (!pkg.exports[key]) fail(`Missing package export ${key}`);
}

console.log("lint ok");

function fail(message) {
  console.error(message);
  process.exit(1);
}
