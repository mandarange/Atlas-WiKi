# Evaluation

Evaluation focuses on ACL leakage, redaction, freshness, conflict markers, citation correctness, audit-chain integrity, package installability, and adapter-neutral boundaries.

## Core Link

`src/eval/harness.ts` defines the typed eval harness registry plus a live AtlasWiki RAG release gate. `scripts/run-rag-eval.mjs` indexes the bundled dataset through the SDK and writes `release-evidence/rag-eval-v<version>.json` with `execution: "live_atlas_wiki"`, `recall_at_k`, `mrr`, `citation_precision`, and `leakage_count`.

## Security

Eval harnesses default to secure expectations: no permission leakage, no unredacted secrets, no unsafe prompt-injection output, and explicit failure metrics.

## Verification

`tests/eval-governance.test.ts` checks harness coverage, golden fixture names, mock metrics, live RAG scoring, and citation precision failure when a result has text but no citation quote.

## Operator Notes

Use the default live gate for local release evidence. Production deployments should add project-specific golden datasets before raising quality claims beyond the bundled release gate.
