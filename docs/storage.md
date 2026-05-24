# Store Contract

Atlas WiKi exposes a typed store contract for SQLite-backed persistence, memory-backed tests, JSON export, error mapping, events, metrics, and adapter placeholders.

## Core Link

`src/store/store-contract.ts` defines the public store shape, `src/store/sqlite-store.ts` implements durable behavior, and `src/store/memory-store.ts` implements lightweight test behavior. `src/capabilities/coverage.ts` maps store capability names to release-gate evidence.

## Security

Store implementations must validate records, preserve ACL projections, redact output snippets, and write audit events for read/write workflows.

## Verification

`tests/security.test.ts`, `tests/integration.test.ts`, and `tests/capability-coverage.test.ts` cover the store contract, SQLite behavior, and adapter placeholders.

## Operator Notes

Use SQLite for persistent state. Use memory storage only for tests and examples. Treat Postgres and object storage entries as adapter placeholders until provider packages are added.
