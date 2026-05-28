import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface HardeningTask {
  id: string;
  area: string;
  checked: boolean;
  evidence: string[];
  required_capability: string;
}

const ledger = JSON.parse(readFileSync("docs/goal/production-hardening-direct-recheck.json", "utf8")) as {
  total: number;
  checked: number;
  unchecked: number;
  tasks: HardeningTask[];
};

const golden = JSON.parse(readFileSync("docs/goal/production-hardening-golden-snapshots.json", "utf8")) as {
  snapshots: Array<{ task_id: string; snapshot_hash: string }>;
};

describe("production hardening completion gate", () => {
  it("keeps all 5,940 ATW-SAFE tasks checked with evidence", () => {
    expect(ledger.total).toBe(5940);
    expect(ledger.tasks).toHaveLength(5940);
    expect(ledger.checked).toBe(5940);
    expect(ledger.unchecked).toBe(0);
    expect(ledger.tasks.every((task) => task.checked)).toBe(true);
    expect(ledger.tasks.every((task) => task.evidence.length > 0)).toBe(true);
  });

  it("covers every hardening area and required proof surface", () => {
    expect(new Set(ledger.tasks.map((task) => task.area))).toHaveLength(27);
    expect(new Set(ledger.tasks.map((task) => task.required_capability))).toEqual(new Set(["impl", "unit", "integration", "security", "negative", "golden", "cli", "sdk", "mcp", "doc", "gate"]));
  });

  it("has a golden snapshot for every generated golden task", () => {
    const goldenTaskIds = ledger.tasks.filter((task) => task.required_capability === "golden").map((task) => task.id);
    const snapshotIds = new Set(golden.snapshots.map((snapshot) => snapshot.task_id));
    expect(golden.snapshots).toHaveLength(goldenTaskIds.length);
    expect(goldenTaskIds.every((id) => snapshotIds.has(id))).toBe(true);
    expect(golden.snapshots.every((snapshot) => /^[a-f0-9]{64}$/.test(snapshot.snapshot_hash))).toBe(true);
  });

  it("references existing local evidence artifacts", () => {
    const evidence = new Set(ledger.tasks.flatMap((task) => task.evidence));
    for (const item of evidence) {
      if (item.startsWith("/") || item.startsWith(".github/") || item.includes(" release:") || item.includes("npm run ") || item.includes("package.json ")) continue;
      if (item.startsWith("docs/") || item.startsWith("src/") || item.startsWith("tests/") || item.startsWith("scripts/") || item.startsWith(".github/") || ["README.md", "SECURITY.md", "CHANGELOG.md", "CONTRIBUTING.md", "LICENSE", "package.json", ".npmignore"].includes(item)) {
        expect(existsSync(item), item).toBe(true);
      }
    }
  });
});
