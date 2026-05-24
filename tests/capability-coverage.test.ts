import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { atlasCapabilitySpecs, capabilityKey, findCapabilitySpec } from "../src/index.js";

const sourceGoal = existsSync("/Users/weklem/Desktop/atlas-wiki-typescript-npm-goal.md")
  ? "/Users/weklem/Desktop/atlas-wiki-typescript-npm-goal.md"
  : "docs/goal/atlas-wiki-typescript-npm-goal.md";

function goalComponents(): Array<{ area: string; name: string }> {
  const text = readFileSync(sourceGoal, "utf8");
  return [...text.matchAll(/^- \[[ x]\] ATW(?:-TS)?-\d+ \| [^|]+ \| (db|store|ingest|retrieve-index)\/([^|]+) \|/gm)]
    .map((match) => ({ area: match[1] ?? "", name: match[2] ?? "" }));
}

describe("capability coverage registry", () => {
  it("maps every db/store/ingest/retrieve-index goal component to a typed capability", () => {
    const components = goalComponents();
    expect(components).toHaveLength(930);
    const missing = components.filter((component) => !findCapabilitySpec(component.area, component.name));
    expect(missing).toEqual([]);
  });

  it("has one capability entry per unique component with release-gate evidence", () => {
    const unique = new Set(goalComponents().map((component) => capabilityKey(component.area, component.name)));
    expect(atlasCapabilitySpecs).toHaveLength(unique.size);
    expect(unique.size).toBe(101);
    expect(atlasCapabilitySpecs.every((spec) => spec.artifact && spec.releaseGate && spec.securityReview === "default_secure")).toBe(true);
    expect(atlasCapabilitySpecs.filter((spec) => spec.stage === "implemented").length).toBeGreaterThan(40);
    expect(atlasCapabilitySpecs.filter((spec) => spec.stage === "adapter_placeholder").length).toBeGreaterThan(5);
  });
});
