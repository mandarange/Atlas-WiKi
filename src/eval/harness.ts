import type { SensitivityLabel, Visibility } from "../core/records/index.js";
import { DeterministicEmbeddingProvider } from "../rag/index.js";
import type { RagMode } from "../rag/index.js";
import { AtlasWiki, actorFromId } from "../sdk/atlas-wiki.js";
import { MemoryStore } from "../store/memory-store.js";

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

export interface RagEvalObservedResult {
  source_id: string;
  chunk_id?: string | undefined;
  title?: string | undefined;
  text?: string | undefined;
  citation?: {
    quote?: string | undefined;
  } | undefined;
}

export interface RagEvalSource {
  alias: string;
  title: string;
  text: string;
  owner?: string | undefined;
  visibility?: Visibility | undefined;
  sensitivity?: SensitivityLabel | undefined;
}

export interface RagEvalCase {
  id: string;
  query: string;
  actor?: string | undefined;
  mode?: RagMode | undefined;
  sources?: RagEvalSource[] | undefined;
  expectedSourceIds?: string[] | undefined;
  expectedSourceAliases?: string[] | undefined;
  expectedCitationTerms: string[];
  deniedTerms?: string[] | undefined;
  observed?: RagEvalObservedResult[] | undefined;
  runtimeOutputText?: string | undefined;
}

export interface RagEvalDataset {
  schema: "atlas-wiki.rag-eval.v1";
  name: string;
  topK: number;
  thresholds: {
    recall_at_k: number;
    mrr: number;
    citation_precision: number;
    leakage_count: number;
  };
  cases: RagEvalCase[];
}

export interface RagEvalReport {
  schema: "atlas-wiki.rag-eval-report.v1";
  execution: "fixture_observations" | "live_atlas_wiki";
  dataset: string;
  topK: number;
  passed: boolean;
  metrics: {
    recall_at_k: number;
    mrr: number;
    citation_precision: number;
    leakage_count: number;
  };
  cases: Array<{
    id: string;
    query: string;
    relevant_rank: number | null;
    recall_hit: boolean;
    reciprocal_rank: number;
      citation_precision: number;
      leakage_count: number;
      mode_used?: string | undefined;
      indexed_chunks?: number | undefined;
  }>;
}

export function runMockEvalSuite(): EvalResult[] {
  return evalHarnesses.map((harness) => ({
    name: harness.name,
    passed: true,
    metrics: Object.fromEntries(harness.metricKeys.map((key) => [key, key.includes("leak") || key.includes("unsafe") || key.includes("false") || key === "failed" ? 0 : 1]))
  }));
}

export const defaultRagEvalDataset: RagEvalDataset = {
  schema: "atlas-wiki.rag-eval.v1",
  name: "atlas-wiki-default-rag-release-gate",
  topK: 3,
  thresholds: {
    recall_at_k: 1,
    mrr: 1,
    citation_precision: 1,
    leakage_count: 0
  },
  cases: [
    {
      id: "rag-citation-policy",
      actor: "alice",
      mode: "hybrid",
      query: "manager approval remote work",
      sources: [
        { alias: "remote", title: "Remote Work Policy", text: "Manager approval remote work policy: remote work requires manager approval.", owner: "user:alice", visibility: "private" },
        { alias: "denied-secret", title: "Finance Secret", text: "service_role_secret must never appear in Alice RAG output.", owner: "user:bob", visibility: "private", sensitivity: "secret" }
      ],
      expectedSourceAliases: ["remote"],
      expectedCitationTerms: ["manager approval"],
      deniedTerms: ["service_role_secret"]
    },
    {
      id: "rag-security-redaction",
      actor: "alice",
      mode: "hybrid",
      query: "browser service role key policy",
      sources: [
        { alias: "security", title: "Security Policy", text: "Browser service role key policy: never expose service role keys in browser code.", owner: "user:alice", visibility: "private" },
        { alias: "denied-token", title: "Incident Secret", text: "A denied token sk_live_forbidden_value is stored here.", owner: "user:bob", visibility: "private", sensitivity: "secret" }
      ],
      expectedSourceAliases: ["security"],
      expectedCitationTerms: ["Never expose service role keys"],
      deniedTerms: ["sk_live_"]
    }
  ]
};

export function runRagEvalDataset(dataset: RagEvalDataset = defaultRagEvalDataset): RagEvalReport {
  const topK = Math.max(1, dataset.topK);
  const cases = dataset.cases.map((testCase) => scoreRagEvalCase(testCase, topK));
  const metrics = {
    recall_at_k: average(cases.map((item) => item.recall_hit ? 1 : 0)),
    mrr: average(cases.map((item) => item.reciprocal_rank)),
    citation_precision: average(cases.map((item) => item.citation_precision)),
    leakage_count: cases.reduce((sum, item) => sum + item.leakage_count, 0)
  };
  const passed =
    metrics.recall_at_k >= dataset.thresholds.recall_at_k &&
    metrics.mrr >= dataset.thresholds.mrr &&
    metrics.citation_precision >= dataset.thresholds.citation_precision &&
    metrics.leakage_count <= dataset.thresholds.leakage_count;
  return {
    schema: "atlas-wiki.rag-eval-report.v1",
    execution: "fixture_observations",
    dataset: dataset.name,
    topK,
    passed,
    metrics,
    cases
  };
}

export async function runLiveRagEvalDataset(dataset: RagEvalDataset = defaultRagEvalDataset): Promise<RagEvalReport> {
  const topK = Math.max(1, dataset.topK);
  const cases: RagEvalReport["cases"] = [];
  for (const testCase of dataset.cases) {
    const actor = actorFromId(testCase.actor);
    const wiki = await AtlasWiki.open({ store: new MemoryStore(), rag: { embeddingProvider: new DeterministicEmbeddingProvider() } });
    try {
      const sourceIdsByAlias = new Map<string, string>();
      for (const source of testCase.sources ?? []) {
        const ingested = await wiki.ingestText({
          title: source.title,
          text: source.text,
          owner: source.owner ?? actor.id,
          visibility: source.visibility ?? "private",
          sensitivity: source.sensitivity
        });
        sourceIdsByAlias.set(source.alias, ingested.id);
      }
      const expectedSourceIds = [
        ...(testCase.expectedSourceIds ?? []),
        ...(testCase.expectedSourceAliases ?? []).map((alias) => sourceIdsByAlias.get(alias)).filter((id): id is string => Boolean(id))
      ];
      const index = await wiki.ragIndex({ actor });
      const search = await wiki.ragSearch({ query: testCase.query, actor, mode: testCase.mode ?? "hybrid", limit: topK });
      const context = await wiki.ragContextPack({ query: testCase.query, actor, mode: testCase.mode ?? "hybrid", limit: topK });
      cases.push(scoreRagEvalCase({
        ...testCase,
        expectedSourceIds,
        observed: search.items.map((item) => ({
          source_id: item.source_id,
          chunk_id: item.chunk_id,
          title: item.title,
          text: item.text,
          citation: { quote: item.citation.quote }
        })),
        runtimeOutputText: JSON.stringify({ search, context: context.pack.citations, metadata: search.metadata }),
      }, topK, { modeUsed: search.metadata.rag.mode_used, indexedChunks: index.indexed }));
    } finally {
      await wiki.close();
    }
  }
  const metrics = {
    recall_at_k: average(cases.map((item) => item.recall_hit ? 1 : 0)),
    mrr: average(cases.map((item) => item.reciprocal_rank)),
    citation_precision: average(cases.map((item) => item.citation_precision)),
    leakage_count: cases.reduce((sum, item) => sum + item.leakage_count, 0)
  };
  const passed =
    metrics.recall_at_k >= dataset.thresholds.recall_at_k &&
    metrics.mrr >= dataset.thresholds.mrr &&
    metrics.citation_precision >= dataset.thresholds.citation_precision &&
    metrics.leakage_count <= dataset.thresholds.leakage_count;
  return {
    schema: "atlas-wiki.rag-eval-report.v1",
    execution: "live_atlas_wiki",
    dataset: dataset.name,
    topK,
    passed,
    metrics,
    cases
  };
}

function scoreRagEvalCase(testCase: RagEvalCase, topK: number, runtime: { modeUsed?: string; indexedChunks?: number } = {}): RagEvalReport["cases"][number] {
  const top = (testCase.observed ?? []).slice(0, topK);
  const expectedSourceIds = testCase.expectedSourceIds ?? [];
  const relevantIndex = top.findIndex((result) => expectedSourceIds.includes(result.source_id));
  const citationHits = top.filter((result) => {
    const quote = `${result.citation?.quote ?? ""}`.toLowerCase();
    return testCase.expectedCitationTerms.every((term) => quote.includes(term.toLowerCase()));
  }).length;
  const joinedOutput = `${top.map((result) => `${result.source_id} ${result.title ?? ""} ${result.text ?? ""} ${result.citation?.quote ?? ""}`).join("\n")}\n${testCase.runtimeOutputText ?? ""}`.toLowerCase();
  const leakageCount = (testCase.deniedTerms ?? []).filter((term) => joinedOutput.includes(term.toLowerCase())).length;
  return {
    id: testCase.id,
    query: testCase.query,
    relevant_rank: relevantIndex < 0 ? null : relevantIndex + 1,
    recall_hit: relevantIndex >= 0,
    reciprocal_rank: relevantIndex < 0 ? 0 : 1 / (relevantIndex + 1),
    citation_precision: top.length === 0 ? 0 : citationHits / top.length,
    leakage_count: leakageCount,
    mode_used: runtime.modeUsed,
    indexed_chunks: runtime.indexedChunks
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}
