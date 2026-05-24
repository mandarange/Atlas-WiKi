export type EvalHarnessName =
  | "RetrievalEvalHarness"
  | "RedactionEvalHarness"
  | "PromptInjectionEvalHarness"
  | "FreshnessEvalHarness"
  | "ConflictEvalHarness"
  | "PermissionLeakageEval"
  | "GoldenDatasetBuilder"
  | "MetricsReporter";

export interface EvalHarnessSpec {
  name: EvalHarnessName;
  evalType: "retrieval" | "redaction" | "prompt_injection" | "freshness" | "conflict" | "permission" | "dataset" | "metrics";
  securityReview: "default_secure";
  goldenFixture: string;
  metricKeys: string[];
}

export const evalHarnesses: readonly EvalHarnessSpec[] = [
  { name: "RetrievalEvalHarness", evalType: "retrieval", securityReview: "default_secure", goldenFixture: "golden/retrieval.json", metricKeys: ["recall", "precision"] },
  { name: "RedactionEvalHarness", evalType: "redaction", securityReview: "default_secure", goldenFixture: "golden/redaction.json", metricKeys: ["leak_count", "redaction_rate"] },
  { name: "PromptInjectionEvalHarness", evalType: "prompt_injection", securityReview: "default_secure", goldenFixture: "golden/prompt-injection.json", metricKeys: ["blocked", "unsafe_output"] },
  { name: "FreshnessEvalHarness", evalType: "freshness", securityReview: "default_secure", goldenFixture: "golden/freshness.json", metricKeys: ["stale_detected", "fresh_detected"] },
  { name: "ConflictEvalHarness", evalType: "conflict", securityReview: "default_secure", goldenFixture: "golden/conflict.json", metricKeys: ["conflicts_detected", "false_positive"] },
  { name: "PermissionLeakageEval", evalType: "permission", securityReview: "default_secure", goldenFixture: "golden/permission-leakage.json", metricKeys: ["denied_leaks", "allowed_hits"] },
  { name: "GoldenDatasetBuilder", evalType: "dataset", securityReview: "default_secure", goldenFixture: "golden/datasets.json", metricKeys: ["records", "coverage"] },
  { name: "MetricsReporter", evalType: "metrics", securityReview: "default_secure", goldenFixture: "golden/metrics.json", metricKeys: ["passed", "failed"] }
];

export interface EvalResult {
  name: EvalHarnessName;
  passed: boolean;
  metrics: Record<string, number>;
}

export function runMockEvalSuite(): EvalResult[] {
  return evalHarnesses.map((harness) => ({
    name: harness.name,
    passed: true,
    metrics: Object.fromEntries(harness.metricKeys.map((key) => [key, key.includes("leak") || key.includes("unsafe") || key.includes("false") || key === "failed" ? 0 : 1]))
  }));
}
