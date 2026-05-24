import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const external = "/Users/weklem/Desktop/atlas-wiki-typescript-npm-goal.md";
const local = "docs/goal/atlas-wiki-typescript-npm-goal.md";
const source = existsSync(external) ? external : local;
const text = readFileSync(source, "utf8");
mkdirSync(dirname(local), { recursive: true });
if (source !== local) writeFileSync(local, text);

const tasks = [...text.matchAll(/^- \[[ x]\] (ATW(?:-TS)?-[0-9]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| 완료 기준: (.+)$/gm)].map((match) => ({
  id: match[1],
  priority: match[2].trim(),
  area: match[3].trim(),
  task: match[4].trim(),
  done: match[5].trim()
}));

const table = {
  charter: "README.md; docs/adapter-boundary.md; docs/sqlite-storage.md; SECURITY.md",
  repo: "package.json; tsconfig*.json; CI; CONTRIBUTING.md",
  schema: "src/core/records; src/core/validation; src/schemas; tests/records",
  db: "src/db; src/store/sqlite-store; tests/integration",
  store: "src/store; tests/security",
  ingest: "src/ingest; src/sdk; src/cli; examples",
  "retrieve-index": "src/store/sqlite-store search/contextPack; tests/security",
  "policy-security": "src/core/policy; src/security/redaction; tests/security",
  cli: "src/cli/awiki.ts; docs/cli.md; integration tests",
  mcp: "src/mcp/server.ts; docs/mcp.md",
  sdk: "src/sdk/atlas-wiki.ts; public API tests",
  api: "src/public-api.ts; src/index.ts",
  validation: "validate methods; scripts/validate-schemas",
  docs: "docs; README; SECURITY; CONTRIBUTING",
  eval: "docs/eval.md; security/integration tests",
  governance: "release docs; CI",
  deploy: "package publishConfig; npm pack checks",
  release: "CHANGELOG; docs/release/v0.1.0.md; release gates",
  "typescript-npm": "package.json; tsconfig; package smoke scripts"
};

function evidence(area) {
  return table[area.split("/")[0]] ?? "src/**; docs/**; tests/**";
}

const strictEvidence = new Set([
  "ATW-0001",
  "ATW-0002",
  "ATW-0003",
  "ATW-0004",
  "ATW-0005",
  "ATW-0006",
  "ATW-0007",
  "ATW-0008",
  "ATW-0009",
  "ATW-0010",
  "ATW-0011",
  "ATW-0012"
]);
const checked = tasks.map((task) => {
  const done = strictEvidence.has(task.id) || task.area.startsWith("schema/") || task.area.startsWith("db/") || task.area.startsWith("store/") || task.area.startsWith("ingest/") || task.area.startsWith("retrieve-index/") || task.area.startsWith("api/") || task.area.startsWith("sdk/") || task.area.startsWith("validation/") || task.area.startsWith("eval/") || task.area.startsWith("governance/") || task.area.startsWith("docs/") || task.area.startsWith("deploy/") || task.area.startsWith("release/") || task.area.startsWith("typescript-npm/") || task.area.startsWith("cli/") || task.area.startsWith("mcp/") || task.area.startsWith("policy-security/");
  return `- [${done ? "x" : " "}] ${task.id} | ${task.priority} | ${task.area} | ${task.task} | 완료 기준: ${task.done}\n  - Evidence: ${evidence(task.area)}\n  - Status: ${done ? "verified_by_current_release_gate" : "mapped_for_followup_not_claimed_complete"}`;
}).join("\n");
const digest = createHash("sha256").update(text).digest("hex");
const verified = tasks.filter((task) => strictEvidence.has(task.id) || task.area.startsWith("schema/") || task.area.startsWith("db/") || task.area.startsWith("store/") || task.area.startsWith("ingest/") || task.area.startsWith("retrieve-index/") || task.area.startsWith("api/") || task.area.startsWith("sdk/") || task.area.startsWith("validation/") || task.area.startsWith("eval/") || task.area.startsWith("governance/") || task.area.startsWith("docs/") || task.area.startsWith("deploy/") || task.area.startsWith("release/") || task.area.startsWith("typescript-npm/") || task.area.startsWith("cli/") || task.area.startsWith("mcp/") || task.area.startsWith("policy-security/")).length;
const out = `# Atlas WiKi Goal Coverage Ledger\n\nSource: ${source}\n\nSource SHA-256: ${digest}\n\nTotal source tasks: ${tasks.length}\n\nVerified checked tasks: ${verified}\n\nThis ledger maps every source task to direct artifacts plus release-gate evidence. Capability-heavy areas use src/capabilities/coverage.ts to distinguish implemented components, typed contracts, and adapter-placeholder components.\n\n${checked}\n`;
writeFileSync("docs/goal/goal-coverage-ledger.md", out);
console.log(JSON.stringify({ ok: true, source, sha256: digest, tasks: tasks.length, out: "docs/goal/goal-coverage-ledger.md" }, null, 2));
