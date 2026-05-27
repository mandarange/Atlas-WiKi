import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertReleaseEvidenceManifest, releaseEvidenceSummary } from "../src/index.js";

describe("release evidence manifest", () => {
  it("keeps the stabilization task ledger machine-readable and complete", () => {
    const manifest = assertReleaseEvidenceManifest(JSON.parse(readFileSync("release-evidence/atlas-wiki-vNEXT.json", "utf8")));
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(manifest.schema).toBe("atlas-wiki.release-evidence.v2");
    expect(manifest.package.version).toBe(pkg.version);
    expect(manifest.sourceGoal.taskTotal).toBeGreaterThanOrEqual(3200);
    expect(manifest.sourceGoal.taskChecked).toBe(manifest.sourceGoal.taskTotal);
    expect(manifest.tasks).toHaveLength(manifest.sourceGoal.taskTotal);
    expect(new Set(manifest.tasks.map((task) => task.area)).size).toBeGreaterThanOrEqual(10);
    expect(manifest.requiredArtifacts.every((artifact) => artifact.sizeBytes > 0)).toBe(true);
    expect(releaseEvidenceSummary(manifest)).toContain(`${manifest.sourceGoal.taskTotal}/${manifest.sourceGoal.taskTotal}`);
  });
});
