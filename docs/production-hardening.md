# Production Hardening Checklist

Atlas WiKi treats these checks as release blockers for a hardened release candidate.

## Core Link

`src/db`, `src/store/sqlite-store.ts`, `src/core/validation`, `src/core/policy`, `src/security/redaction.ts`, `src/mcp/server.ts`, and `scripts/package-verify.mjs` implement these gates.

## Security

The checklist blocks unsafe migration replay, unknown schemas, unauthorized context leakage, MCP root override, audit tampering, and broken package exports.

## Verification

Use the commands in the package gate section below plus `npm run release:check`.

## Operator Notes

Treat any failed item as a release blocker for `latest`. Use prerelease or `rc` tags until all hardening gates pass.

## Database

- Migrations are looked up before SQL execution.
- Applied migrations store checksum, applied time, package version, Node version, and ordinal.
- Changed checksums, missing migrations, and out-of-order migrations fail hard.
- Migration execution uses `BEGIN IMMEDIATE` and rolls back failed migration sets.
- `PRAGMA user_version` is aligned to the packaged migration registry length.
- `awiki migrate report --json` exposes the dry-run migration state.
- `awiki validate --json` runs `integrity_check`, `foreign_key_check`, record validation, and audit-chain verification.

## Access And Context

- Unknown record schemas are rejected by default.
- Every stored record passes the policy resolver before read output.
- Unauthorized records are filtered before redaction, citation assembly, context packs, CLI output, SDK output, and MCP output.
- Context packs include `denied_count`, `redacted_count`, `stale_count`, `conflict_count`, `candidate_count`, `authorized_count`, `query_backend`, and `fallback_reason`.

## MCP

- `createReadonlyAtlasWikiServer()` is the default MCP surface.
- `createAdminAtlasWikiServer()` must be selected explicitly for ingest, backup creation, index rebuild, and proposal tools.
- Production mode rejects tool-supplied `root` unless `devAllowRootInput` is explicitly enabled.
- Allowed roots are normalized and checked before opening a store.

## Audit

- Audit ids use crypto-safe random ids.
- Audit hashes use deterministic canonical JSON.
- `awiki audit verify --json` reports audit-chain findings.
- Tampering, deletion, and row-order changes are release blockers.

## Package

- `npm run release:check` remains the top-level gate.
- `npm run test:migrations`, `npm run test:context-leakage`, `npm run test:mcp`, and `npm run test:audit` cover hardened blockers directly.
- `npm run package:verify` checks build output and the intentional export map, including `./mcp/admin`.
