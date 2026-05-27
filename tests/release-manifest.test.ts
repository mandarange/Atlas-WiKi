import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertReleaseEvidenceManifest, releaseEvidenceSummary } from "../src/index.js";

describe("release evidence manifest", () => {
  it("keeps the stabilization task ledger machine-readable and complete", () => {
    const manifest = assertReleaseEvidenceManifest(JSON.parse(readFileSync("release-evidence/atlas-wiki-vNEXT.json", "utf8")));
    expect(manifest.package.version).toBe("0.1.5");
    expect(manifest.sourceGoal.taskTotal).toBeGreaterThanOrEqual(2600);
    expect(manifest.sourceGoal.taskChecked).toBe(manifest.sourceGoal.taskTotal);
    expect(manifest.tasks).toHaveLength(manifest.sourceGoal.taskTotal);
    expect(new Set(manifest.tasks.map((task) => task.area))).toHaveLength(31);
    expect(releaseEvidenceSummary(manifest)).toContain(`${manifest.sourceGoal.taskTotal}/${manifest.sourceGoal.taskTotal}`);
  });
});
