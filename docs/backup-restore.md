# Backup And Restore

Atlas WiKi creates SQLite backups with the Node SQLite backup API so WAL-backed databases are copied consistently.

## Core Link

`src/db/backup.ts` creates and verifies backup files. `SqliteStore.backupCreate` writes into `exports/sqlite-backups`, and `SqliteStore.backupVerify` checks integrity.

## Security

Backups may contain source text and metadata. Store them with the same access controls as the live database.

## Verification

Integration tests create and verify a backup, then open the backup and check that the `records` table exists.

## Operator Notes

Run `awiki backup create` before migrations or bulk imports. Run `awiki backup verify` before relying on an exported file.
