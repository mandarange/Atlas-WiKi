import { existsSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { assertReleaseEvidenceManifest, releaseEvidenceSummary } = await import(pathToFileURL(`${process.cwd()}/dist/release/manifest.js`).href);

const latestEvidencePath = "release-evidence/atlas-wiki-vNEXT.json";
const ledgerPath = "docs/goal/next-stable-coverage-ledger.json";
const externalGoalPath = "/Users/weklem/Desktop/atlas-wiki-next-9plus-total-closure-goal.md";
const localGoalPath = "docs/goal/atlas-wiki-next-9plus-total-closure-goal.md";
const sourceGoalPath = existsSync(externalGoalPath) ? externalGoalPath : localGoalPath;

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const prepublishPath = `release-evidence/prepublish-v${pkg.version}.json`;
const postpublishPath = `release-evidence/postpublish-v${pkg.version}.json`;
const latestManifest = assertReleaseEvidenceManifest(readJsonNonEmpty(latestEvidencePath));
const prepublishManifest = assertReleaseEvidenceManifest(readJsonNonEmpty(prepublishPath));
const ledger = readJsonNonEmpty(ledgerPath);

if (pkg.name !== "atlas-wiki") fail("package.json name must remain atlas-wiki");
if (pkg.version !== latestManifest.package.version || pkg.version !== prepublishManifest.package.version) fail("release evidence package version must match package.json");
if (lock.version !== pkg.version || lock.packages?.[""]?.version !== pkg.version) fail("package-lock version must match package.json");
const packageInfo = readFileSync("src/package-info.ts", "utf8");
if (!packageInfo.includes(`version: "${pkg.version}"`)) fail("src/package-info.ts version must match package.json");
if (prepublishManifest.phase !== "prepublish") fail("prepublish evidence must use phase=prepublish");
if (latestManifest.phase !== "prepublish" && latestManifest.phase !== "postpublish") fail("vNEXT summary must be a release evidence manifest");

const registryMatchesIntended = latestManifest.npm.version === pkg.version && latestManifest.npm.latest === pkg.version;
const registryIsPublishedBaseline =
  latestManifest.npm.version === latestManifest.npm.latest &&
  compareSemver(latestManifest.npm.version, pkg.version) < 0;
if (!registryMatchesIntended && !registryIsPublishedBaseline) {
  fail("npm registry metadata must either match the intended package version or record the already-published pre-publish baseline");
}
if (registryIsPublishedBaseline && latestManifest.npm.gitHead && latestManifest.git.baselineTagHead && latestManifest.npm.gitHead !== latestManifest.git.baselineTagHead) {
  fail("pre-publish npm gitHead must match baseline tag head in release evidence");
}
if (latestManifest.phase === "postpublish" && latestManifest.npm.gitHead && latestManifest.git.targetTagHead && latestManifest.npm.gitHead !== latestManifest.git.targetTagHead) {
  fail("postpublish npm gitHead must match target tag head");
}
if (!latestManifest.npm.integrity || !latestManifest.npm.shasum) fail("release evidence must record npm integrity and shasum");

if (ledger.schema !== "atlas-wiki.next-9plus-coverage.v1") fail("N9 total closure coverage ledger schema mismatch");
if (ledger.task_total < 3200 || ledger.task_checked !== ledger.task_total) fail("N9 task ledger must contain all checked tasks");
if (ledger.checklist_total < 3200 || ledger.checklist_checked !== ledger.checklist_total) fail("N9 source checklist must contain all checked boxes");
if (!Array.isArray(ledger.tasks) || ledger.tasks.length !== ledger.task_total) fail("N9 ledger task array mismatch");
if (ledger.tasks.some((task) => !Array.isArray(task.evidence) || task.evidence.length === 0)) fail("N9 ledger has a task without evidence");

const sourceGoal = readFileSync(sourceGoalPath, "utf8");
const unchecked = (sourceGoal.match(/^- \[ \]/gm) ?? []).length;
const checked = (sourceGoal.match(/^- \[x\]/gm) ?? []).length;
if (unchecked !== 0 || checked !== ledger.checklist_total) fail(`source goal checklist incomplete: checked=${checked} unchecked=${unchecked}`);

for (const artifact of latestManifest.requiredArtifacts) assertArtifact(artifact);
for (const artifact of prepublishManifest.requiredArtifacts) assertArtifact(artifact);
if (existsSync(postpublishPath)) {
  const postpublishManifest = assertReleaseEvidenceManifest(readJsonNonEmpty(postpublishPath));
  if (postpublishManifest.phase !== "postpublish") fail("postpublish evidence must use phase=postpublish");
  if (!postpublishManifest.postpublish?.smokeOk) fail("postpublish evidence must record passing published smoke");
}
if (process.env.ATLAS_WIKI_REQUIRE_POSTPUBLISH_EVIDENCE === "1" && !existsSync(postpublishPath)) fail("postpublish evidence is required but missing");
if (process.env.ATLAS_WIKI_REQUIRE_EXTERNAL_RELEASE_EVIDENCE === "1") {
  if (!latestManifest.git.targetTagHead) fail("external release evidence requires target tag head");
  if (!latestManifest.ci?.runUrl) fail("external release evidence requires CI run URL");
  if (!existsSync(postpublishPath)) fail("external release evidence requires postpublish evidence");
}

const publishWorkflow = readFileSync(".github/workflows/publish.yml", "utf8");
for (const required of [
  "contents: write",
  "id-token: write",
  "package-manager-cache: false",
  "npm run release:check",
  "npm publish",
  "ATLAS_WIKI_PUBLISHED_SPEC=atlas-wiki@${VERSION} npm run release:published-check",
  "node scripts/generate-next-stable-release-evidence.mjs --postpublish --smoke-ok",
  "actions/upload-artifact",
  "gh release upload"
]) {
  if (!publishWorkflow.includes(required)) fail(`publish workflow missing ${required}`);
}
if (/cache:\s*npm/.test(publishWorkflow)) fail("publish workflow must not use dependency cache");

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
if (!ci.includes("pull_request") || !ci.includes("branches: [main]") || !ci.includes("tags:")) fail("CI must run on pull requests, main, and tags");
if (!ci.includes("npm run release:check")) fail("CI must run release:check");

const guard = readFileSync("scripts/publish-guard.mjs", "utf8");
if (!guard.includes("local-authenticated-npm") || !guard.includes("ACTIONS_ID_TOKEN_REQUEST_TOKEN")) fail("publish guard must allow direct local npm publish while preserving trusted OIDC context detection");
const dryRun = readFileSync("scripts/package-dry-run.mjs", "utf8");
if (!dryRun.includes("npm\", [\"publish\", \"--dry-run\"]") || !dryRun.includes("already-published reproducibility baseline")) fail("package dry-run wrapper must execute npm publish --dry-run and handle the published baseline");
const publishedSmoke = readFileSync("scripts/published-package-smoke.mjs", "utf8");
if (!publishedSmoke.includes('"rag", "index"') || !publishedSmoke.includes('"rag", "search"') || !publishedSmoke.includes('"--mode", "vector"')) {
  fail("published package smoke must verify CLI RAG vector restart flow");
}

for (const path of [
  "tests/mcp-authz.test.ts",
  "tests/audit-tail-deletion.test.ts",
  "tests/fetch-policy-matrix.test.ts",
  "tests/root-policy-cross-platform.test.ts",
  "tests/rag.test.ts",
  "tests/supabase-store.test.ts",
  "tests/structured-ingestion.test.ts",
  "scripts/published-package-smoke.mjs"
]) {
  const text = readFileSync(path, "utf8");
  if (!text.includes("describe(") && !path.endsWith(".mjs")) fail(`${path} must define a Vitest suite`);
}

console.log(releaseEvidenceSummary(latestManifest));

function readJsonNonEmpty(path) {
  if (!existsSync(path)) fail(`Required JSON artifact missing: ${path}`);
  if (statSync(path).size <= 0) fail(`Required JSON artifact is empty: ${path}`);
  const text = readFileSync(path, "utf8");
  if (text.trim().length === 0) fail(`Required JSON artifact is whitespace-only: ${path}`);
  return JSON.parse(text);
}

function assertArtifact(artifact) {
  if (!existsSync(artifact.path)) fail(`Required artifact missing: ${artifact.path}`);
  if (statSync(artifact.path).size <= 0) fail(`Required artifact is empty: ${artifact.path}`);
  if (!artifact.exists || artifact.sizeBytes <= 0) fail(`Required artifact metadata is stale: ${artifact.path}`);
  if (artifact.path.endsWith(".mjs") && (statSync(artifact.path).mode & 0o444) === 0) fail(`Required script is unreadable: ${artifact.path}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function parseSemver(version) {
  if (typeof version !== "string") return null;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1, 4).map((part) => Number(part));
}
