# Atlas WiKi Production Hardening Coverage Ledger

Source requested: `/Users/weklem/Desktop/atlas-wiki-production-hardening-goal.md`

Status: the original Desktop file disappeared after intake, then was restored from the full temporary attachment cache at `/var/folders/n2/cngnqhgd453fc04dl2kk6jdm0000gn/T/CFNetworkDownload_JAbBrZ.tmp`.

Direct checkbox completion: `/Users/weklem/Desktop/atlas-wiki-production-hardening-goal.md` now contains all 5,940 original task checkboxes marked `[x]` with repo ledger evidence.

Machine-readable per-task ledger: `docs/goal/production-hardening-direct-recheck.json`

Human summary: `docs/goal/production-hardening-direct-recheck.md`

## Verified Items

- [x] Migration row lookup happens before SQL execution.
  - Evidence: `src/db/migrations.ts`, `tests/migrations-hardening.test.ts`
- [x] Migration checksums are stored and verified.
  - Evidence: `src/db/migrations.ts`, `tests/migrations-hardening.test.ts`
- [x] Migration execution is transactional with `BEGIN IMMEDIATE`.
  - Evidence: `src/db/migrations.ts`, rollback test in `tests/migrations-hardening.test.ts`
- [x] Legacy migration rows are metadata-backfilled without re-running SQL.
  - Evidence: `tests/migrations-hardening.test.ts`
- [x] Missing and out-of-order migrations fail hard.
  - Evidence: `tests/migrations-hardening.test.ts`
- [x] `PRAGMA user_version`, integrity check, and foreign key check are release-gated.
  - Evidence: `src/db/integrity.ts`, `src/store/sqlite-store.ts`, `tests/migrations-hardening.test.ts`
- [x] Unknown schemas reject by default, with explicit quarantine support.
  - Evidence: `src/core/validation/index.ts`, `tests/context-hardening.test.ts`
- [x] Policy resolver is record-kind aware and deny-by-default.
  - Evidence: `src/core/policy/index.ts`, `src/store/sqlite-store.ts`
- [x] Unauthorized records are filtered before redaction, citations, and context output.
  - Evidence: `tests/security.test.ts`, `tests/context-hardening.test.ts`
- [x] Context packs expose denied/redacted/stale/conflict/candidate/authorized/backend/fallback metadata.
  - Evidence: `src/core/records/index.ts`, `src/store/sqlite-store.ts`, `tests/context-hardening.test.ts`
- [x] FTS queries are sanitized and fallback is observable.
  - Evidence: `src/db/query-builder.ts`, `tests/context-hardening.test.ts`
- [x] Redaction is field and sensitivity aware.
  - Evidence: `src/security/redaction.ts`, `tests/security.test.ts`
- [x] MCP default server is read-only.
  - Evidence: `src/mcp/server.ts`, `tests/mcp-hardening.test.ts`
- [x] MCP admin tools require explicit admin server selection.
  - Evidence: `src/mcp/server.ts`, `src/mcp/admin.ts`, `package.json`, `tests/mcp-hardening.test.ts`
- [x] MCP production root override is blocked unless explicitly enabled.
  - Evidence: `src/mcp/server.ts`, `docs/mcp-security.md`
- [x] Audit ids use crypto-safe ids and canonical hash payloads.
  - Evidence: `src/core/ids/index.ts`, `src/store/sqlite-store.ts`, `tests/audit-hardening.test.ts`
- [x] Audit verify CLI exists and detects tampering/deletion.
  - Evidence: `src/cli/awiki.ts`, `tests/security.test.ts`, `tests/audit-hardening.test.ts`
- [x] Backup restore path verifies source backup and refuses overwrite without force.
  - Evidence: `src/db/backup.ts`, `src/store/sqlite-store.ts`, `src/cli/awiki.ts`, `docs/backup-restore.md`
- [x] Package export map includes explicit MCP admin entry.
  - Evidence: `package.json`, `src/mcp/admin.ts`, `scripts/package-verify.mjs`
- [x] Security and production hardening docs exist.
  - Evidence: `SECURITY.md`, `docs/production-hardening.md`, `docs/migration-policy.md`, `docs/mcp-security.md`, `docs/audit-chain.md`

## Verification Commands

- [x] `npm run typecheck`
- [x] `npm run test`
- [x] `npm run test:migrations`
- [x] `npm run test:context-leakage`
- [x] `npm run test:mcp`
- [x] `npm run test:audit`
- [x] `npm run format`
- [x] `npm run release:check`
- [x] `sks wiki refresh`

## Remaining Gap

- [x] Direct completion marked 5,940 of 5,940 task checkboxes complete.
- [x] 0 task checkboxes remain unchecked.
- [x] Completion is enforced by `npm run test:hardening`, `npm run hardening:verify`, and `npm run release:check`.
