# Backup And Restore

Atlas WiKi creates SQLite backups with the Node SQLite backup API so WAL-backed databases are copied consistently.

## Core Link

`src/db/backup.ts` creates, verifies, and restores backup files. `SqliteStore.backupCreate` writes into `exports/sqlite-backups`, `SqliteStore.backupVerify` checks integrity, and `SqliteStore.backupRestore` refuses to overwrite a live database unless `--force` is used.

## Security

Backups may contain source text and metadata. Store them with the same access controls as the live database.

## Verification

Integration tests create and verify a backup, then open the backup and check that the `records` table exists.

## Operator Notes

Run `awiki backup create` before migrations or bulk imports. Run `awiki backup verify` before relying on an exported file. Restore with `awiki backup restore --in ./backup.sqlite --root ./.atlas-wiki --force` only after verifying the target root.
