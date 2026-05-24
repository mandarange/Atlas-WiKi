# Governance

Atlas WiKi governance is proposal-first: risky changes are represented as records and audited before acceptance.

## Core Link

`src/governance/index.ts` defines workflows for proposal approval, owner notification, change history, compliance reports, retention, legal hold, data export, and deletion requests.

## Security

Protected actions require audit by default. Deletion and export workflows remain explicit protected actions instead of silent background jobs.

## Verification

`tests/eval-governance.test.ts` verifies workflow coverage, protected-action classification, and audit requirements.

## Operator Notes

Use proposal records for user-facing change requests and review governance reports before retention or deletion work.
