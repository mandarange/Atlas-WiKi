# Disaster Recovery

## Core Link

Backups are created by `awiki backup create` and verified by `awiki backup verify`, both backed by `src/db/backup.ts`.

## Security

Backup files contain source records and must be protected like the live SQLite database.

## Verification

Before restore, run `awiki backup verify`. After restore, run `awiki validate`, `awiki rebuild-index`, and a representative `awiki search`.

## Operator Notes

Restore by stopping writers, copying the chosen `.bak` into the data root as `atlas-wiki.sqlite`, then validating and rebuilding projections.
