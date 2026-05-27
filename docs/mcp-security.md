# MCP Security

Atlas WiKi MCP is read-only by default.

## Core Link

`src/mcp/server.ts` defines readonly/admin server constructors, tool lists, root resolution, actor handling, and MCP audit events.

## Security

Production mode rejects tool-supplied roots and actors by default, requires server-side actor injection, and keeps write-capable tools off the default server. Admin tools also require an explicit `authorizeTool` callback.

## Verification

`npm run test:mcp` checks readonly/admin separation, production input schema hardening, admin authorization, and MCP constructor availability.

## Operator Notes

Pass a server-side root, allowed root list, and `actor` or `actorProvider` in production. Use `--dev-allow-root-input` only for local development. Treat admin MCP as local-operator-only unless deployment authentication wraps it.

## Surfaces

- `createReadonlyAtlasWikiServer()` exposes search, fetch, context packs, citation explanation, freshness, conflict lookup, owner lookup, source listing, access validation, validation, audit report, backup verification, and connector status.
- `createAdminAtlasWikiServer()` adds proposal tools, trusted ingest, FTS rebuild, and backup creation.
- `createAtlasWikiMcpServer()` selects readonly unless `admin: true` is passed.

## Root Policy

Production mode resolves the data root from server configuration. Tool input cannot override `root` unless `devAllowRootInput` is explicitly set.

Allowed roots are normalized with `path.resolve` and `realpathSync` when they exist. A requested root must match or sit under an allowed root after symlink resolution, so symlink traversal and platform separator drift are denied.

## Actor Policy

Production mode rejects tool-supplied actor ids unless `allowActorInput` or `devAllowRootInput` is explicitly set. Deployments that need authenticated actors must inject actor context server-side with `actor` or `actorProvider`.

## Admin Authorization

Admin MCP tools are denied unless `authorizeTool(toolName, input)` returns `true`. `atlas_wiki.ingest`, `atlas_wiki.rebuild_index`, and `atlas_wiki.backup_create` are only registered on the admin server constructor.

## Audit

Every MCP tool call writes `mcp.<tool>` audit metadata. Underlying store operations also write their normal audit events.
