import { existsSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { assertReleaseEvidenceManifest, releaseEvidenceSummary } = await import(pathToFileURL(`${process.cwd()}/dist/release/manifest.js`).href);
const evidencePath = "release-evidence/atlas-wiki-vNEXT.json";
const ledgerPath = "docs/goal/next-stable-coverage-ledger.json";
const sourceGoalPath = existsSync("/Users/weklem/Desktop/atlas-wiki-0.1.1-next-stable-goal.md")
  ? "/Users/weklem/Desktop/atlas-wiki-0.1.1-next-stable-goal.md"
  : "docs/goal/atlas-wiki-0.1.1-next-stable-goal.md";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync(evidencePath, "utf8"));
assertReleaseEvidenceManifest(manifest);
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));

if (pkg.name !== "atlas-wiki") fail("package.json name must remain atlas-wiki");
if (pkg.version !== manifest.package.version) fail("release evidence package version must match package.json");
if (pkg.version !== manifest.npm.version) fail("npm view version must match intended package version in release evidence");
if (manifest.npm.latest !== pkg.version) fail("npm latest dist-tag must match intended package version in release evidence");
if (manifest.npm.gitHead && manifest.git.v011TagHead && manifest.npm.gitHead !== manifest.git.v011TagHead) fail("npm gitHead must match v0.1.1 tag head in release evidence");
if (!manifest.npm.integrity || !manifest.npm.shasum) fail("release evidence must record npm integrity and shasum");

if (ledger.task_total !== 1536 || ledger.task_checked !== 1536) fail("next stable task ledger must contain 1536 checked tasks");
if (ledger.checklist_total !== 1576 || ledger.checklist_checked !== 1576) fail("next stable source checklist must contain 1576 checked boxes");
if (!Array.isArray(ledger.tasks) || ledger.tasks.length !== 1536) fail("next stable ledger task array mismatch");
if (ledger.tasks.some((task) => !Array.isArray(task.evidence) || task.evidence.length === 0)) fail("next stable ledger has a task without evidence");

const sourceGoal = readFileSync(sourceGoalPath, "utf8");
const unchecked = (sourceGoal.match(/^- \[ \]/gm) ?? []).length;
const checked = (sourceGoal.match(/^- \[x\]/gm) ?? []).length;
if (unchecked !== 0 || checked !== 1576) fail(`source goal checklist incomplete: checked=${checked} unchecked=${unchecked}`);

for (const artifact of manifest.requiredArtifacts) {
  if (!existsSync(artifact.path)) fail(`Required artifact missing: ${artifact.path}`);
  if (artifact.path.endsWith(".mjs") && (statSync(artifact.path).mode & 0o444) === 0) fail(`Required script is unreadable: ${artifact.path}`);
}

const publishWorkflow = readFileSync(".github/workflows/publish.yml", "utf8");
for (const required of ["id-token: write", "package-manager-cache: false", "npm run release:check", "npm publish"]) {
  if (!publishWorkflow.includes(required)) fail(`publish workflow missing ${required}`);
}
if (/cache:\s*npm/.test(publishWorkflow)) fail("publish workflow must not use dependency cache");

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
if (!ci.includes("pull_request") || !ci.includes("branches: [main]") || !ci.includes("tags:")) fail("CI must run on pull requests, main, and tags");
if (!ci.includes("npm run release:check")) fail("CI must run release:check");

const guard = readFileSync("scripts/publish-guard.mjs", "utf8");
if (!guard.includes("ATLAS_WIKI_EMERGENCY_LOCAL_PUBLISH") || !guard.includes("ACTIONS_ID_TOKEN_REQUEST_TOKEN")) fail("publish guard must block local stable publish without trusted OIDC or emergency override");
const dryRun = readFileSync("scripts/package-dry-run.mjs", "utf8");
if (!dryRun.includes("npm\", [\"publish\", \"--dry-run\"]") || !dryRun.includes("already-published reproducibility baseline")) fail("package dry-run wrapper must execute npm publish --dry-run and handle the published baseline");

for (const path of [
  "tests/mcp-authz.test.ts",
  "tests/audit-tail-deletion.test.ts",
  "tests/fetch-policy-matrix.test.ts",
  "tests/root-policy-cross-platform.test.ts",
  "scripts/published-package-smoke.mjs"
]) {
  const text = readFileSync(path, "utf8");
  if (!text.includes("describe(") && !path.endsWith(".mjs")) fail(`${path} must define a Vitest suite`);
}

console.log(releaseEvidenceSummary(manifest));

function fail(message) {
  console.error(message);
  process.exit(1);
}
