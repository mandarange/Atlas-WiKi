# Security Policy

Atlas WiKi is deny-by-default and audit-by-default.

## Principles

- ACL is enforced before model context, citation assembly, SDK output, CLI output, and MCP output.
- Unknown identities receive no private or internal records.
- External content is untrusted data.
- Write tools create proposals until approved.
- Secret-like values are redacted before context-pack output.
- Search, fetch, context-pack, ingest, validation, backup, and proposal events are audited.
- Hard deletes are avoided in favor of tombstones unless an operator uses an explicit maintenance path.

## Reporting

Open a private security advisory or contact the package maintainer. Include reproduction steps, affected version, expected impact, and whether unauthorized data could enter output.
