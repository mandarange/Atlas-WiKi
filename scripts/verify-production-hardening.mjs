import { existsSync, readFileSync } from "node:fs";

const ledgerPath = "docs/goal/production-hardening-direct-recheck.json";
const goldenPath = "docs/goal/production-hardening-golden-snapshots.json";
const desktopChecklistPath = "/Users/weklem/Desktop/atlas-wiki-production-hardening-goal.md";

const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

if (ledger.total !== 5940) fail(`Expected 5940 production hardening tasks, found ${ledger.total}`);
if (ledger.tasks.length !== 5940) fail(`Expected 5940 ledger task entries, found ${ledger.tasks.length}`);
if (ledger.checked !== 5940 || ledger.unchecked !== 0) fail(`Production hardening ledger is incomplete: checked=${ledger.checked} unchecked=${ledger.unchecked}`);

const unchecked = ledger.tasks.filter((task) => !task.checked);
if (unchecked.length > 0) fail(`Unchecked production hardening tasks remain: ${unchecked.slice(0, 5).map((task) => task.id).join(", ")}`);

const evidenceMissing = ledger.tasks.filter((task) => !Array.isArray(task.evidence) || task.evidence.length === 0);
if (evidenceMissing.length > 0) fail(`Tasks without evidence remain: ${evidenceMissing.slice(0, 5).map((task) => task.id).join(", ")}`);

const areas = new Set(ledger.tasks.map((task) => task.area));
if (areas.size !== 27) fail(`Expected 27 hardening areas, found ${areas.size}`);

const capabilities = new Set(ledger.tasks.map((task) => task.required_capability));
for (const capability of ["impl", "unit", "integration", "security", "negative", "golden", "cli", "sdk", "mcp", "doc", "gate"]) {
  if (!capabilities.has(capability)) fail(`Missing capability coverage: ${capability}`);
}

const goldenTasks = ledger.tasks.filter((task) => task.required_capability === "golden");
if (golden.snapshots.length !== goldenTasks.length) fail(`Golden snapshot count mismatch: snapshots=${golden.snapshots.length} tasks=${goldenTasks.length}`);
for (const task of goldenTasks) {
  if (!golden.snapshots.some((snapshot) => snapshot.task_id === task.id)) fail(`Missing golden snapshot for ${task.id}`);
}

for (const evidence of new Set(ledger.tasks.flatMap((task) => task.evidence))) {
  if (typeof evidence !== "string") fail("Evidence entries must be strings");
  if (evidence.startsWith("/") || evidence.startsWith(".github/") || evidence.includes(" release:") || evidence.includes("npm run ") || evidence.includes("package.json ")) continue;
  if (evidence.startsWith("docs/") || evidence.startsWith("src/") || evidence.startsWith("tests/") || evidence.startsWith("scripts/") || evidence.startsWith(".github/") || evidence === "README.md" || evidence === "SECURITY.md" || evidence === "CHANGELOG.md" || evidence === "CONTRIBUTING.md" || evidence === "LICENSE" || evidence === "package.json" || evidence === ".npmignore") {
    if (!existsSync(evidence)) fail(`Evidence file does not exist: ${evidence}`);
  }
}

if (!pkg.scripts?.["hardening:verify"]?.includes("verify-production-hardening.mjs")) fail("Missing hardening:verify script");
if (!pkg.scripts?.["test:hardening"]?.includes("production-hardening-completion.test.ts")) fail("Missing test:hardening script");
if (!pkg.scripts?.["release:check"]?.includes("hardening:verify")) fail("release:check must include hardening:verify");
if (!pkg.scripts?.["release:check"]?.includes("test:hardening")) fail("release:check must include test:hardening");

if (existsSync(desktopChecklistPath)) {
  const checklist = readFileSync(desktopChecklistPath, "utf8");
  const checked = (checklist.match(/^- \[x\] ATW-SAFE-/gm) ?? []).length;
  const uncheckedCount = (checklist.match(/^- \[ \] ATW-SAFE-/gm) ?? []).length;
  if (checked !== 5940 || uncheckedCount !== 0) fail(`Desktop checklist is incomplete: checked=${checked} unchecked=${uncheckedCount}`);
}

console.log("production hardening verify ok");

function fail(message) {
  console.error(message);
  process.exit(1);
}
