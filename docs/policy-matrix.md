# Policy Matrix

Atlas WiKi applies record-kind-aware policy before search, context assembly, fetch, and MCP output.

## Core Link

`src/core/policy/index.ts` resolves ACL policy. `src/store/sqlite-store.ts` calls that resolver before search, list, fetch, validate access, and context packs. `tests/fetch-policy-matrix.test.ts` covers source, chunk, claim, proposal, and audit fetch behavior.

## Security

Records without explicit readable ACL are denied by default. Source and chunk records can be readable when their ACL allows it. Proposal, audit, context-pack, and other internal records remain hidden unless an explicit record policy grants read access.

## Verification

Run:

```bash
npm run test -- tests/fetch-policy-matrix.test.ts tests/security.test.ts tests/context-hardening.test.ts
```

The regression gate verifies empty query denial, source listing as the explicit enumeration surface, and deny-by-default non-source fetch behavior.

## Operator Notes

Do not treat redaction as an access control substitute. Unauthorized records must be filtered before redaction, citation assembly, package output, or MCP output.

