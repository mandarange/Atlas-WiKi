import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => /\.(ts|md|json|yml|mjs)$/.test(file));

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (text.includes("\r\n")) fail(`CRLF line endings in ${file}`);
  if (!text.endsWith("\n")) fail(`Missing trailing newline in ${file}`);
}

console.log("format ok");

function fail(message) {
  console.error(message);
  process.exit(1);
}
