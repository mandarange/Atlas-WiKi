# Architecture

Atlas WiKi is a local-first knowledge ledger with four layers: typed records, SQLite persistence, retrieval/context packing, and adapters for CLI/SDK/MCP.

## Core Link

The public API starts in `src/public-api.ts`. Record contracts live in `src/core/records`, runtime validation lives in `src/core/validation`, and SQLite projections live in `src/db/schema.ts` plus `src/store/sqlite-store.ts`.

## Security

The architecture is deny-by-default for private records and audit-by-default for reads and writes. Adapter code is not allowed to bypass `validateRecord`, ACL decisions, redaction, or audit logging.

## Verification

`npm run release:check` exercises type checking, build output, tests, schema validation, package verification, dry-run packing, and package install smoke tests.

## Operator Notes

Use SQLite backups for portable state, JSON shards for inspection, and MCP/CLI only as adapters over the same store contract.
