import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertReleaseEvidenceManifest, releaseEvidenceSummary } from "../src/index.js";

describe("release evidence manifest", () => {
  it("keeps the next stable task ledger machine-readable and complete", () => {
    const manifest = assertReleaseEvidenceManifest(JSON.parse(readFileSync("release-evidence/atlas-wiki-vNEXT.json", "utf8")));
    expect(manifest.sourceGoal.taskTotal).toBe(1536);
    expect(manifest.sourceGoal.taskChecked).toBe(1536);
    expect(manifest.tasks).toHaveLength(1536);
    expect(new Set(manifest.tasks.map((task) => task.area))).toHaveLength(24);
    expect(releaseEvidenceSummary(manifest)).toContain("1536/1536");
  });
});
