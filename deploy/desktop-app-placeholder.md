# Desktop App Placeholder

## Core Link

The desktop app is an adapter placeholder over the SDK and must not bypass `AtlasWiki` or store contracts.

## Security

The desktop app must use the same ACL, redaction, audit, and backup flows as CLI, SDK, and MCP.

## Verification

Until a desktop package exists, package smoke tests and SDK tests are the executable readiness gate.

## Operator Notes

Desktop state should use an explicit Atlas WiKi root and expose backup/verify controls.
