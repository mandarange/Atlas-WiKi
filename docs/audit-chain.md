# Audit Chain

Atlas WiKi audit events are append-only records in `audit_events`.

## Core Link

`src/store/sqlite-store.ts` writes audit events and validates the hash chain. `src/core/hash/index.ts` provides canonical JSON hashing.

## Security

Audit hashes are tamper-evident and chained. Payload edits, deletion, and order changes become validation findings.

## Verification

`npm run test:audit` and `awiki audit verify --json` verify the audit-chain behavior.

## Operator Notes

Run audit verification after backup restore, migration, manual inspection, or incident response.

## Hash Payload

Each event hashes canonical JSON containing:

- id
- event type
- actor
- record references
- policy decisions
- outcome
- created timestamp
- previous hash

The event row stores `hash_prev` and `hash_self`. The next event must point at the previous row hash.

## Verification

```bash
awiki audit verify --root ./.atlas-wiki --json
awiki validate --root ./.atlas-wiki --json
```

Validation recomputes every hash and checks the previous-hash chain in SQLite row order. Tampering with a payload, deleting a middle row, or reordering rows causes a blocking finding.

## Limits

The local SQLite chain is tamper-evident, not tamper-proof. Operators who need external anchoring should export or sign validation reports in their deployment pipeline.
