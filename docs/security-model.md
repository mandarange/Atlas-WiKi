# Security Model

Atlas WiKi uses query-time permission filtering before any answer or context-pack output. Pipeline: resolve actor, generate candidates, apply ACL, redact, annotate freshness/conflicts, assemble citations, emit context pack, append audit event. Unauthorized record existence is not disclosed.

## Core Link

`src/core/policy`, `src/security/redaction.ts`, and `src/store/sqlite-store.ts` form the security path.

## Security

Defaults are private/internal, unknown schemas are rejected by default, redaction runs before output, and audit validation detects row tampering, deletion, and previous-hash mismatches.

## Verification

`npm run test:security`, `npm run test:context-leakage`, `npm run test:mcp`, and `npm run test:audit` cover private-result filtering, secret redaction, metadata counts, MCP surface separation, and audit-chain tamper detection.

## Operator Notes

Use least-privilege owner grants and treat context packs as derived material that still requires source review.
