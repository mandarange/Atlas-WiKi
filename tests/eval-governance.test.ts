import { describe, expect, it } from "vitest";
import { buildGovernanceReport, defaultRagEvalDataset, evalHarnesses, governanceWorkflows, runLiveRagEvalDataset, runMockEvalSuite, runRagEvalDataset } from "../src/index.js";

describe("eval and governance registries", () => {
  it("covers every evaluation harness required by the goal", () => {
    expect(evalHarnesses).toHaveLength(8);
    expect(evalHarnesses.every((harness) => harness.securityReview === "default_secure")).toBe(true);
    expect(evalHarnesses.every((harness) => harness.goldenFixture.startsWith("golden/"))).toBe(true);
    const results = runMockEvalSuite();
    expect(results).toHaveLength(8);
    expect(results.every((result) => result.passed)).toBe(true);
  });

  it("computes live AtlasWiki RAG release gate metrics", async () => {
    const report = await runLiveRagEvalDataset(defaultRagEvalDataset);
    expect(report).toMatchObject({
      schema: "atlas-wiki.rag-eval-report.v1",
      execution: "live_atlas_wiki",
      passed: true,
      metrics: {
        recall_at_k: 1,
        mrr: 1,
        citation_precision: 1,
        leakage_count: 0
      }
    });
  });

  it("does not count raw chunk text as citation precision", () => {
    const report = runRagEvalDataset({
      ...defaultRagEvalDataset,
      cases: [{
        id: "missing-citation",
        query: "manager approval",
        expectedSourceIds: ["source_1"],
        expectedCitationTerms: ["manager approval"],
        observed: [{ source_id: "source_1", text: "manager approval appears here" }]
      }]
    });
    expect(report.metrics.citation_precision).toBe(0);
    expect(report.passed).toBe(false);
  });

  it("covers every governance workflow required by the goal", () => {
    expect(governanceWorkflows).toHaveLength(8);
    expect(governanceWorkflows.every((workflow) => workflow.requiresAudit)).toBe(true);
    expect(governanceWorkflows.every((workflow) => workflow.securityReview === "default_secure")).toBe(true);
    expect(buildGovernanceReport()).toEqual({ workflows: 8, protectedActions: 4, auditRequired: true });
  });
});
