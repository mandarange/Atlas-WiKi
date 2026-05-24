# MCP Surface

Read tools include `atlas_wiki.search`, `fetch`, `context_pack`, freshness, conflicts, owner lookup, sources, and access validation. Write-capable tools create proposals. Admin tools cover ingest, index rebuild, validation, audit reports, backup, and connector status.

## Core Link

`src/mcp/server.ts` adapts MCP calls onto `AtlasWiki` and the store contract.

## Security

MCP tools do not bypass ACL checks. Write-like tools create proposals or use the same ingest/admin path as CLI.

## Verification

Integration tests run MCP smoke checks after building the CLI and package.

## Operator Notes

Use stdio transport for local agents and provide an explicit Atlas WiKi root for persistent state.
