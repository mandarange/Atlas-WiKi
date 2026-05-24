# SQLite Storage

SQLite is the default canonical source of truth. JSON shards are export/import artifacts, not canonical state. The data root is `.atlas-wiki/` and contains `atlas-wiki.sqlite`, config, blobs, caches, exports, reports, and tmp directories. All writes run in transactions, WAL mode is enabled, foreign keys are enforced, migrations are idempotent, and FTS indexes are rebuildable projections.

## Core Link

`src/db/connection.ts`, `src/db/schema.ts`, `src/db/migrations.ts`, and `src/store/sqlite-store.ts` own the storage path.

## Security

SQLite files and backups contain source text. Protect the data root as sensitive application state.

## Verification

Integration tests initialize the database, ingest records, query FTS, create backups, and verify backup integrity.

## Operator Notes

Run `awiki validate` and `awiki backup verify` after manual file movement, restore, or migration work.
