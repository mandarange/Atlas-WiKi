# MCP Surface

Read tools include `atlas_wiki.search`, `fetch`, `context_pack`, freshness, conflicts, owner lookup, sources, access validation, validation, audit reports, backup verification, and connector status. The default MCP server is read-only.

Admin mode is explicit. `createAdminAtlasWikiServer()` adds proposal tools, trusted ingest, index rebuild, and backup creation.

## Core Link

`src/mcp/server.ts` adapts MCP calls onto `AtlasWiki` and the store contract. `@mandarange/atlas-wiki/mcp` exports the readonly default. `@mandarange/atlas-wiki/mcp/admin` exports the admin constructor.

## Security

MCP tools do not bypass ACL checks. Production mode rejects tool-supplied roots by default and checks normalized roots against an allowlist. Write-like tools create proposals or use the explicit admin path.

## Verification

Integration tests run MCP smoke checks after building the CLI and package.

## Operator Notes

Use stdio transport for local agents and provide an explicit Atlas WiKi root for persistent state.
