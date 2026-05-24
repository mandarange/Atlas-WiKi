# Adapter Boundary

Atlas WiKi core is agent-neutral. Core modules must not import or depend on product-specific agent runtimes, IDE workflows, route harnesses, completion proof systems, or connector SDKs. Optional integrations must live outside core packages.

## Core Link

The boundary is enforced by public API exports and release checks that inspect core paths for agent-specific literals.

## Security

Adapters inherit core policy decisions and must not introduce a privileged read path.

## Verification

Release gates include core-literal scans, package smoke tests, and MCP/CLI integration checks.

## Operator Notes

Keep migration and adapter code outside core unless it is expressed through records, stores, or typed contracts.
