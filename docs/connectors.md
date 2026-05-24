# Connector Strategy

Connectors are optional adapters. Core defines connector contracts, cursors, ACL snapshots, dry-run ingest plans, and deletion-sync semantics, but does not import SaaS-specific SDKs.

## Core Link

Connector metadata is represented with `ConnectorRecord` and optional ingest metadata. Connector implementations should call SDK ingest APIs.

## Security

Connector credentials must stay outside records. Store only connector IDs, cursor state, hashes, and ACL snapshots.

## Verification

Connector placeholder coverage is validated through schema fixtures and MCP connector-status smoke behavior.

## Operator Notes

Add provider-specific SDKs in adapter packages, not in core.
