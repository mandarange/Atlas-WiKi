# Migration Policy

Atlas WiKi migrations are append-only package artifacts. A database records each applied migration by id, checksum, applied timestamp, package version, Node version, and ordinal.

## Core Link

`src/db/migrations.ts` owns lookup-before-execute behavior, checksum verification, transactional execution, dry-run reporting, and `user_version` alignment.

## Security

Changed checksums, missing rows, and out-of-order rows fail hard to prevent silent DB drift.

## Verification

`npm run test:migrations` covers metadata storage, legacy backfill, changed checksums, rollback, missing migration detection, and out-of-order detection.

## Operator Notes

Take and verify a backup before migration. Do not edit the `migrations` table manually in production.

## Rules

- Look up the migration row before executing SQL.
- If the row exists and the checksum matches, skip SQL execution.
- If the row exists without legacy metadata, backfill checksum and runtime metadata without executing SQL.
- If the checksum differs, fail hard.
- If the database has an applied id not present in the package registry, fail hard.
- If a later migration is applied while an earlier package migration is missing, fail hard.
- Execute pending migrations inside `BEGIN IMMEDIATE`.
- Roll back the entire migration set on failure.
- Align `PRAGMA user_version` with the package migration registry length.

## Operator Commands

```bash
awiki migrate report --root ./.atlas-wiki --json
awiki validate --root ./.atlas-wiki --json
```

Run `awiki backup create` before migrations and `awiki backup verify` before relying on a backup.
