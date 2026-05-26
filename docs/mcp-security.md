# MCP Security

Atlas WiKi MCP is read-only by default.

## Core Link

`src/mcp/server.ts` defines readonly/admin server constructors, tool lists, root resolution, actor handling, and MCP audit events.

## Security

Production mode rejects tool-supplied roots by default and keeps write-capable tools off the default server.

## Verification

`npm run test:mcp` checks readonly/admin separation and MCP constructor availability.

## Operator Notes

Pass a server-side root and allowed root list in production. Use `--dev-allow-root-input` only for local development.

## Surfaces

- `createReadonlyAtlasWikiServer()` exposes search, fetch, context packs, citation explanation, freshness, conflict lookup, owner lookup, source listing, access validation, validation, audit report, backup verification, and connector status.
- `createAdminAtlasWikiServer()` adds proposal tools, trusted ingest, FTS rebuild, and backup creation.
- `createAtlasWikiMcpServer()` selects readonly unless `admin: true` is passed.

## Root Policy

Production mode resolves the data root from server configuration. Tool input cannot override `root` unless `devAllowRootInput` is explicitly set.

Allowed roots are normalized with `path.resolve`. A requested root must match or sit under an allowed root.

## Actor Policy

Production mode rejects tool-supplied actor ids unless `allowActorInput` or `devAllowRootInput` is explicitly set. Deployments that need authenticated actors should inject actor context server-side.

## Audit

Every MCP tool call writes `mcp.<tool>` audit metadata. Underlying store operations also write their normal audit events.
