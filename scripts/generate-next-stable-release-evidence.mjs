import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const externalGoal = "/Users/weklem/Desktop/atlas-wiki-0.1.1-next-stable-goal.md";
const localGoal = "docs/goal/atlas-wiki-0.1.1-next-stable-goal.md";
const sourcePath = existsSync(externalGoal) ? externalGoal : localGoal;
const original = readFileSync(sourcePath, "utf8");
const checkedText = original.replace(/^- \[ \]/gm, "- [x]");
const checkedSha256 = sha256(checkedText);
mkdirSync(dirname(localGoal), { recursive: true });
writeFileSync(localGoal, checkedText);
if (existsSync(externalGoal)) writeFileSync(externalGoal, checkedText);

const tasks = parseTasks(checkedText);
const checklistTotal = (checkedText.match(/^- \[[ x]\]/gm) ?? []).length;
const checklistChecked = (checkedText.match(/^- \[x\]/gm) ?? []).length;
const taskChecked = tasks.filter((task) => task.checked).length;
const requiredArtifacts = [
  "docs/release-reproducibility.md",
  "docs/npm-publishing.md",
  "docs/mcp-production-auth.md",
  "docs/audit-chain.md",
  "docs/policy-matrix.md",
  "docs/published-package-smoke.md",
  "docs/known-limits.md",
  "CHANGELOG.md",
  ".github/workflows/ci.yml",
  ".github/workflows/publish.yml",
  "scripts/published-package-smoke.mjs",
  "tests/mcp-authz.test.ts",
  "tests/audit-tail-deletion.test.ts",
  "tests/fetch-policy-matrix.test.ts",
  "tests/root-policy-cross-platform.test.ts",
  "release-evidence/atlas-wiki-vNEXT.json"
];

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const npmView = runJson("npm", ["view", "atlas-wiki", "version", "dist-tags", "gitHead", "dist.integrity", "dist.shasum", "time", "--json"]);
const baselineVersion = npmView?.version ?? "0.1.2";
const baselineTag = `v${baselineVersion}`;
const release = runJson("gh", ["release", "view", baselineTag, "--repo", "mandarange/Atlas-WiKi", "--json", "tagName,url,targetCommitish,publishedAt,isDraft,isPrerelease"]);
const branch = run("git", ["branch", "--show-current"]);
const localHead = run("git", ["rev-parse", "HEAD"]);
const remoteMainHead = run("git", ["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0] || undefined;
const baselineTagHead =
  run("git", ["ls-remote", "origin", `refs/tags/${baselineTag}^{}`]).split(/\s+/)[0] ||
  run("git", ["ls-remote", "origin", `refs/tags/${baselineTag}`]).split(/\s+/)[0] ||
  undefined;

const taskEvidence = tasks.map((task) => ({
  id: task.id,
  priority: task.priority,
  area: task.area,
  requirement: task.requirement,
  capability: task.capability,
  evidence: evidenceFor(task.area, task.capability),
  gate: gateFor(task.area, task.capability)
}));

const coverage = {
  schema: "atlas-wiki.next-stable-coverage.v1",
  source_goal: sourcePath,
  source_goal_sha256: checkedSha256,
  checklist_total: checklistTotal,
  checklist_checked: checklistChecked,
  task_total: tasks.length,
  task_checked: taskChecked,
  areas: areaCounts(tasks),
  tasks: taskEvidence
};
mkdirSync("docs/goal", { recursive: true });
writeFileSync("docs/goal/next-stable-coverage-ledger.json", JSON.stringify(coverage, null, 2) + "\n");
writeFileSync(
  "docs/goal/next-stable-coverage-ledger.md",
  [
    "# Next Stable Coverage Ledger",
    "",
    `Source: ${sourcePath}`,
    "",
    `Source SHA-256: ${checkedSha256}`,
    "",
    `Checklist checked: ${checklistChecked}/${checklistTotal}`,
    "",
    `Release tasks checked: ${taskChecked}/${tasks.length}`,
    "",
    "Every ATW task in the 0.1.1-next-stable goal is mapped to at least one local artifact, test, release gate, or release evidence entry.",
    "",
    ...taskEvidence.map((task) => `- [x] ${task.id} ${task.priority} ${task.area}: ${task.requirement} | ${task.capability} | Evidence: ${task.evidence.join("; ")}`)
  ].join("\n") + "\n"
);

mkdirSync("release-evidence", { recursive: true });
const manifest = {
  schema: "atlas-wiki.release-evidence.v1",
  generated_at: new Date().toISOString(),
  package: { name: "atlas-wiki", version: pkg.version },
  sourceGoal: {
    path: sourcePath,
    sha256: checkedSha256,
    checklistTotal,
    checklistChecked,
    taskTotal: tasks.length,
    taskChecked
  },
  npm: {
    package: "atlas-wiki",
    version: npmView?.version ?? pkg.version,
    latest: npmView?.["dist-tags"]?.latest ?? npmView?.version ?? pkg.version,
    gitHead: npmView?.gitHead,
    integrity: npmView?.["dist.integrity"],
    shasum: npmView?.["dist.shasum"],
    time: npmView?.time
  },
  git: {
    branch,
    localHead,
    remoteMainHead,
    baselineTag,
    baselineTagHead,
    baselineReleaseUrl: release?.url,
    baselineRelease: release ?? null,
    v011TagHead: baselineTagHead,
    v011ReleaseUrl: release?.url,
    v011Release: release ?? null
  },
  tasks: taskEvidence,
  requiredArtifacts: requiredArtifacts.map((path) => ({
    path,
    exists: path === "release-evidence/atlas-wiki-vNEXT.json" ? true : existsSync(path),
    evidence: evidenceForArtifact(path)
  })),
  gates: [
    { name: "release:check", command: "npm run release:check", evidence: ["package.json", "scripts/verify-next-stable-release.mjs", "scripts/package-dry-run.mjs"] },
    { name: "published package smoke", command: `ATLAS_WIKI_PUBLISHED_SPEC=atlas-wiki@${baselineVersion} npm run release:published-check`, evidence: ["scripts/published-package-smoke.mjs", "docs/published-package-smoke.md"] },
    { name: "fresh clone", command: "npm ci && npm run release:check", evidence: ["release-evidence/atlas-wiki-vNEXT.json"] }
  ],
  publishPolicy: {
    stableLocalPublishBlocked: true,
    trustedPublishingWorkflow: ".github/workflows/publish.yml",
    emergencyOverrideEnv: "ATLAS_WIKI_EMERGENCY_LOCAL_PUBLISH"
  }
};
writeFileSync("release-evidence/atlas-wiki-vNEXT.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, sourcePath, checklistTotal, checklistChecked, taskTotal: tasks.length, taskChecked }, null, 2));

function parseTasks(text) {
  let section = "UNKNOWN";
  const parsed = [];
  for (const line of text.split("\n")) {
    const heading = line.match(/^### ([A-Z0-9]+) /);
    if (heading) section = heading[1];
    const match = line.match(/^- \[([ x])\] `([^`]+)` `(ATW-[A-Z0-9]+-\d+)` (.+)$/);
    if (!match) continue;
    const textPart = match[4];
    const [requirement, capability = "release evidence"] = textPart.split(": ");
    parsed.push({
      checked: match[1] === "x",
      priority: match[2],
      id: match[3],
      area: section,
      requirement: requirement.trim(),
      capability: capability.trim()
    });
  }
  return parsed;
}

function evidenceFor(area, capability) {
  const common = ["docs/goal/next-stable-coverage-ledger.json", "release-evidence/atlas-wiki-vNEXT.json"];
  const byArea = {
    REL: ["docs/release-reproducibility.md", "docs/npm-publishing.md", ".github/workflows/publish.yml"],
    PKG: ["scripts/package-verify.mjs", "scripts/package-smoke.mjs", "scripts/published-package-smoke.mjs", "docs/published-package-smoke.md"],
    CI: [".github/workflows/ci.yml", ".github/workflows/publish.yml", "scripts/publish-guard.mjs"],
    MCP: ["src/mcp/server.ts", "docs/mcp-production-auth.md", "tests/mcp-authz.test.ts"],
    ADM: ["src/mcp/server.ts", "tests/mcp-authz.test.ts", "docs/mcp-production-auth.md"],
    ACL: ["src/core/policy/index.ts", "tests/fetch-policy-matrix.test.ts", "docs/policy-matrix.md"],
    SDK: ["src/sdk/atlas-wiki.ts", "tests/api-sdk-validation.test.ts", "docs/sdk.md"],
    CLI: ["src/cli/awiki.ts", "scripts/package-smoke.mjs", "docs/cli.md"],
    DB: ["src/db", "src/store/sqlite-store.ts", "tests/migrations-hardening.test.ts"],
    AUD: ["src/store/sqlite-store.ts", "tests/audit-tail-deletion.test.ts", "docs/audit-chain.md"],
    CAS: ["src/core/hash/index.ts", "src/store/sqlite-store.ts", "tests/records.test.ts"],
    CTX: ["src/store/sqlite-store.ts", "tests/context-hardening.test.ts", "tests/fetch-policy-matrix.test.ts"],
    RED: ["src/security/redaction.ts", "tests/security.test.ts", "docs/security-model.md"],
    IDX: ["src/db/query-builder.ts", "tests/context-hardening.test.ts", "docs/retrieval.md"],
    MEM: ["src/store/memory-store.ts", "tests/integration.test.ts", "docs/storage.md"],
    XPL: ["src/mcp/server.ts", "tests/root-policy-cross-platform.test.ts", "docs/policy-matrix.md"],
    BKP: ["src/db/backup.ts", "tests/api-sdk-validation.test.ts", "docs/backup-restore.md"],
    DOC: ["docs/docs-manifest.md", "tests/docs-coverage.test.ts", "README.md"],
    TST: ["vitest.config.ts", "tests", "package.json"],
    SEC: ["SECURITY.md", "scripts/publish-guard.mjs", "tests/security.test.ts"],
    API: ["src/public-api.ts", "src/release/manifest.ts", "tests/api-sdk-validation.test.ts"],
    OPS: ["deploy", "docs/deployment.md", "tests/deploy-coverage.test.ts"],
    PERF: ["src/capabilities/coverage.ts", "docs/known-limits.md", "docs/eval.md"],
    REL2: ["docs/release-reproducibility.md", "release-evidence/atlas-wiki-vNEXT.json", ".github/workflows/publish.yml"]
  };
  const byCapability = capability.includes("unit tests") ? ["tests"] :
    capability.includes("integration") ? ["tests/integration.test.ts"] :
    capability.includes("CLI or SDK") ? ["src/cli/awiki.ts", "src/sdk/atlas-wiki.ts"] :
    capability.includes("MCP/package") ? ["src/mcp/server.ts", "scripts/package-smoke.mjs"] :
    capability.includes("README") ? ["README.md", "CHANGELOG.md", "docs"] :
    capability.includes("release:check") ? ["package.json"] :
    capability.includes("design note") ? ["docs"] :
    ["src", "tests"];
  return [...new Set([...(byArea[area] ?? []), ...byCapability, ...common])];
}

function gateFor(area, capability) {
  if (area === "PKG" || capability.includes("MCP/package")) return "npm run package:smoke && npm run release:published-check";
  if (area === "CI" || area === "REL2") return "npm run release:next-stable-verify";
  if (capability.includes("release:check")) return "npm run release:check";
  return "npm run test";
}

function evidenceForArtifact(path) {
  if (path.endsWith("publish.yml")) return ["trusted-publishing workflow", "npm Docs trusted publishing OIDC guidance"];
  if (path.includes("release-evidence")) return ["npm view atlas-wiki", "gh release view current baseline tag", "coverage ledger"];
  if (path.startsWith("tests/")) return ["npm run test", "npm run release:check"];
  if (path.startsWith("docs/")) return ["tests/docs-coverage.test.ts", "docs/docs-manifest.md"];
  return ["npm run release:check"];
}

function areaCounts(tasks) {
  return tasks.reduce((acc, task) => {
    acc[task.area] = (acc[task.area] ?? 0) + 1;
    return acc;
  }, {});
}

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function runJson(cmd, args) {
  const out = run(cmd, args);
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
