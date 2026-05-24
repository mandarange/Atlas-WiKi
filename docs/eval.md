# Evaluation

Evaluation focuses on ACL leakage, redaction, freshness, conflict markers, citation correctness, audit-chain integrity, package installability, and adapter-neutral boundaries.

## Core Link

`src/eval/harness.ts` defines the typed eval harness registry and a mock suite for release-gate smoke checks.

## Security

Eval harnesses default to secure expectations: no permission leakage, no unredacted secrets, no unsafe prompt-injection output, and explicit failure metrics.

## Verification

`tests/eval-governance.test.ts` checks harness coverage, golden fixture names, and mock metrics.

## Operator Notes

Use mock evals for package smoke and replace them with dataset-backed evals before promoting production deployments.
