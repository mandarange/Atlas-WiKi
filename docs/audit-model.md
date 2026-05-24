# Audit Model

Atlas WiKi records read, write, search, context-pack, ingest, proposal, and backup-relevant operations as append-only audit events.

## Core Link

`SqliteStore.logAudit` writes `audit_events`. `SqliteStore.validate` recomputes each row hash and checks the previous-hash chain by SQLite row order.

## Security

Tampering with an audit row invalidates the recomputed hash. Tampering with ordering invalidates the previous-hash chain.

## Verification

`tests/security.test.ts` mutates an audit row and expects validation to fail with an audit-chain finding.

## Operator Notes

Run `awiki validate` after migrations, restores, or manual inspection. Treat audit findings as blocking until the underlying database state is understood.
