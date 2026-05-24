# ACL Model

Atlas WiKi stores visibility and grants on source-backed records. Public records are readable by everyone, internal records require an authenticated actor, and private records require an explicit grant or matching owner.

## Core Link

`src/core/policy` owns access decisions. `src/store/sqlite-store.ts` writes ACL projections into `record_acl`, and retrieval filters every result through `sourcePolicyDecision`.

## Security

Denied records are omitted from search and fetch results, and denied attempts are logged. Search snippets are redacted before they leave the store.

## Verification

`tests/security.test.ts` covers unauthorized filtering, private visibility, redaction, and audit tamper detection.

## Operator Notes

Prefer team owners such as `team:knowledge` for shared material. Keep secret material private and use proposal workflows for changes that require review.
