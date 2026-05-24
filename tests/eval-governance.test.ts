import { describe, expect, it } from "vitest";
import { buildGovernanceReport, evalHarnesses, governanceWorkflows, runMockEvalSuite } from "../src/index.js";

describe("eval and governance registries", () => {
  it("covers every evaluation harness required by the goal", () => {
    expect(evalHarnesses).toHaveLength(8);
    expect(evalHarnesses.every((harness) => harness.securityReview === "default_secure")).toBe(true);
    expect(evalHarnesses.every((harness) => harness.goldenFixture.startsWith("golden/"))).toBe(true);
    const results = runMockEvalSuite();
    expect(results).toHaveLength(8);
    expect(results.every((result) => result.passed)).toBe(true);
  });

  it("covers every governance workflow required by the goal", () => {
    expect(governanceWorkflows).toHaveLength(8);
    expect(governanceWorkflows.every((workflow) => workflow.requiresAudit)).toBe(true);
    expect(governanceWorkflows.every((workflow) => workflow.securityReview === "default_secure")).toBe(true);
    expect(buildGovernanceReport()).toEqual({ workflows: 8, protectedActions: 4, auditRequired: true });
  });
});
