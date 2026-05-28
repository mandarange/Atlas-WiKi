import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { assertReleaseEvidenceManifest, releaseEvidenceSummary } = await import(pathToFileURL(`${process.cwd()}/dist/release/manifest.js`).href);

const latestEvidencePath = "release-evidence/atlas-wiki-vNEXT.json";
const ledgerPath = "docs/goal/next-stable-coverage-ledger.json";
const latestStablePath = "release-evidence/latest.json";
const externalGoalPath = "/Users/weklem/Desktop/atlas-wiki-final-9plus-next-release-goal.md";
const localGoalPath = "docs/goal/atlas-wiki-final-9plus-next-release-goal.md";
const sourceGoalPath = existsSync(externalGoalPath) ? externalGoalPath : localGoalPath;

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const prepublishPath = `release-evidence/prepublish-v${pkg.version}.json`;
const postpublishPath = `release-evidence/postpublish-v${pkg.version}.json`;
const latestManifest = assertReleaseEvidenceManifest(readJsonNonEmpty(latestEvidencePath));
const prepublishManifest = assertReleaseEvidenceManifest(readJsonNonEmpty(prepublishPath));
const ledger = readJsonNonEmpty(ledgerPath);
const latestStable = readJsonNonEmpty(latestStablePath);

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
  console.warn("warning: pre-publish npm gitHead differs from the already-published baseline tag head; continuing because the target package version is not published yet");
}
if (latestManifest.phase === "postpublish" && latestManifest.npm.gitHead && latestManifest.git.targetTagHead && latestManifest.npm.gitHead !== latestManifest.git.targetTagHead) {
  fail("postpublish npm gitHead must match target tag head");
}
if (!latestManifest.npm.integrity || !latestManifest.npm.shasum) fail("release evidence must record npm integrity and shasum");

if (ledger.schema !== "atlas-wiki.next-9plus-coverage.v1") fail("F9 closure coverage ledger schema mismatch");
if (ledger.task_total < 2000 || ledger.task_checked !== ledger.task_total) fail("F9 task ledger must contain all checked tasks");
if (ledger.checklist_total < 2000 || ledger.checklist_checked !== ledger.checklist_total) fail("F9 source checklist must contain all checked boxes");
if (!Array.isArray(ledger.tasks) || ledger.tasks.length !== ledger.task_total) fail("F9 ledger task array mismatch");
if (ledger.tasks.some((task) => !Array.isArray(task.evidence) || task.evidence.length === 0)) fail("F9 ledger has a task without evidence");

const sourceGoal = readFileSync(sourceGoalPath, "utf8");
const unchecked = (sourceGoal.match(/^- \[ \]/gm) ?? []).length;
const checked = (sourceGoal.match(/^- \[x\]/gm) ?? []).length;
if (unchecked !== 0 || checked !== ledger.checklist_total) fail(`source goal checklist incomplete: checked=${checked} unchecked=${unchecked}`);
for (const source of [latestManifest.sourceGoal, prepublishManifest.sourceGoal]) {
  if (!existsSync(source.path)) fail(`release evidence source goal is missing: ${source.path}`);
  const sourceHash = sha256(readFileSync(source.path));
  if (source.sha256 !== sourceHash) fail(`release evidence source goal hash mismatch: ${source.path}`);
  if (source.sha256 !== ledger.source_goal_sha256) fail("release manifest and F9 ledger source hashes differ");
}
if (latestStable.schema !== "atlas-wiki.release-latest.v1" || latestStable.package !== "atlas-wiki" || !latestStable.version || !latestStable.latest || !latestStable.integrity || !latestStable.shasum) fail("latest release evidence summary is invalid");
if (!latestManifest.sourceGoal.path.includes("final-9plus-next-release-goal") && !latestManifest.sourceGoal.path.includes("atlas-wiki-final-9plus-next-release-goal")) fail("release evidence must bind the F9 source goal");
if (!existsSync(latestManifest.sourceGoal.path)) fail(`release evidence source goal is missing: ${latestManifest.sourceGoal.path}`);
const currentCiRun = process.env.GITHUB_ACTIONS === "true" && latestManifest.ci?.runId === process.env.GITHUB_RUN_ID && latestManifest.ci?.conclusion === "current-run";
if (latestManifest.ci?.provider === "github-actions" && !latestManifest.ci?.runUrl && !currentCiRun) fail("GitHub Actions evidence must include a run URL");
if (!Array.isArray(latestManifest.scorecard) || latestManifest.scorecard.length < 8) fail("release evidence must include scorecard evidence bindings");
const selfScoreKeys = new Set(Object.keys(latestManifest.selfScore ?? {}));
const scorecardKeys = new Set(latestManifest.scorecard.map((score) => score.area));
for (const key of selfScoreKeys) {
  if (!scorecardKeys.has(key) && !scorecardKeys.has(key.replace(/^supabase_store$/, "supabase_operational_validation"))) fail(`selfScore missing scorecard binding: ${key}`);
}
for (const score of latestManifest.scorecard) {
  if (score.score < 9) fail(`release score below 9: ${score.area}`);
  if (!Array.isArray(score.evidence) || score.evidence.length === 0) fail(`release score missing evidence: ${score.area}`);
  if (!score.gate || typeof score.gate !== "string") fail(`release score missing gate: ${score.area}`);
  for (const path of score.evidence) {
    if (!existsSync(path)) fail(`release score evidence path missing: ${score.area}: ${path}`);
    if (path.startsWith("release-evidence/")) readJsonNonEmpty(path);
  }
}
const ragEval = readJsonNonEmpty(`release-evidence/rag-eval-v${pkg.version}.json`);
if (ragEval.schema !== "atlas-wiki.rag-eval-report.v1" || ragEval.execution !== "live_atlas_wiki" || !ragEval.passed || ragEval.metrics?.leakage_count !== 0) fail("RAG eval metrics gate did not pass");
const supabaseSmokePath = `release-evidence/supabase-local-smoke-v${pkg.version}.json`;
const supabaseSmoke = readJsonNonEmpty(supabaseSmokePath);
if (process.env.ATLAS_WIKI_REQUIRE_SUPABASE_LOCAL_SMOKE === "1" && supabaseSmoke.status !== "passed") fail("Supabase local smoke is required but not passed");
if (supabaseSmoke.status !== "passed") {
  const limitation = latestManifest.evidenceLimitations?.supabaseLocalSmoke;
  if (!limitation || limitation.productionProof !== false || limitation.status !== supabaseSmoke.status) fail("Skipped Supabase local smoke must be recorded as a non-production-proof limitation");
  for (const score of latestManifest.scorecard.filter((item) => String(item.area).startsWith("supabase_"))) {
    if (score.evidence.includes(supabaseSmokePath)) fail(`Skipped Supabase local smoke must not be counted as score evidence: ${score.area}`);
  }
}

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
  if (!existsSync(postpublishPath)) fail("external release evidence requires postpublish evidence");
}

if (existsSync(".github/workflows/ci.yml") || existsSync(".github/workflows/publish.yml")) fail("GitHub Actions CI/publish runners must remain removed; use local release gates");

const guard = readFileSync("scripts/publish-guard.mjs", "utf8");
if (!guard.includes("local-authenticated-npm") || !guard.includes("ACTIONS_ID_TOKEN_REQUEST_TOKEN")) fail("publish guard must allow direct local npm publish while preserving trusted OIDC context detection");
const dryRun = readFileSync("scripts/package-dry-run.mjs", "utf8");
if (!dryRun.includes("npm\", [\"publish\", \"--dry-run\"]") || !dryRun.includes("already-published reproducibility baseline")) fail("package dry-run wrapper must execute npm publish --dry-run and handle the published baseline");
const publishedSmoke = readFileSync("scripts/published-package-smoke.mjs", "utf8");
if (!publishedSmoke.includes("is required for published smoke") || !publishedSmoke.includes("installedPkg.version !== packageVersion")) fail("published package smoke must require and verify an explicit package version");
if (publishedSmoke.includes("baseline-missing") || publishedSmoke.includes("hasBackendExports")) fail("published package smoke must not mask missing required package subpath exports");
if (!publishedSmoke.includes('"rag", "index"') || !publishedSmoke.includes('"rag", "search"') || !publishedSmoke.includes('"--mode", "vector"')) {
  fail("published package smoke must verify CLI RAG vector restart flow");
}
if (!publishedSmoke.includes("supabase/migrations") || !publishedSmoke.includes('"awiki", "supabase", "init"') || !publishedSmoke.includes("supabaseMigrationExport")) {
  fail("published package smoke must verify npm-only Supabase migration export");
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
  const stat = statSync(artifact.path);
  if (stat.size <= 0) fail(`Required artifact is empty: ${artifact.path}`);
  if (!artifact.exists || artifact.sizeBytes <= 0) fail(`Required artifact metadata is stale: ${artifact.path}`);
  if (artifact.sizeBytes !== stat.size) fail(`Required artifact size changed after manifest generation: ${artifact.path}`);
  if (stat.isFile() && artifact.sha256 && artifact.sha256 !== sha256(readFileSync(artifact.path))) fail(`Required artifact hash changed after manifest generation: ${artifact.path}`);
  if (artifact.path.endsWith(".mjs") && (stat.mode & 0o444) === 0) fail(`Required script is unreadable: ${artifact.path}`);
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
