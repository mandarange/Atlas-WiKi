# MCP Surface

Read tools include `atlas_wiki.search`, `fetch`, `context_pack`, freshness, conflicts, owner lookup, sources, access validation, validation, audit reports, backup verification, and connector status. The default MCP server is read-only.

Admin mode is explicit. `createAdminAtlasWikiServer()` adds proposal tools, trusted ingest, index rebuild, and backup creation.

Readonly server example:

```ts
import { createReadonlyAtlasWikiServer } from "atlas-wiki/mcp";

export const server = createReadonlyAtlasWikiServer({ root: ".atlas-wiki" });
```

Admin server example:

```ts
import { createAdminAtlasWikiServer } from "atlas-wiki/mcp/admin";

export const server = createAdminAtlasWikiServer({
  root: ".atlas-wiki",
  actorProvider: async () => ({ id: "service:mcp-admin", type: "service", groups: ["authenticated"] }),
  authorizeTool: async ({ actor, toolName }) => actor.id === "service:mcp-admin" && toolName.startsWith("atlas_wiki.")
});
```

## Core Link

`src/mcp/server.ts` adapts MCP calls onto `AtlasWiki` and the store contract. `atlas-wiki/mcp` exports the readonly default. `atlas-wiki/mcp/admin` exports the admin constructor. `examples/mcp-readonly-server.ts` and `examples/mcp-admin-server.ts` provide package-consumer starting points.

## Security

MCP tools do not bypass ACL checks. Production mode rejects tool-supplied roots and impersonation inputs by default because root and actor resolution belong in server-side deployment code, not public tool schemas. Write-like tools create proposals or use the explicit admin path. If the store is Supabase-backed, keep service role keys in server environment/config only; never accept a service role key as a tool input.

## Verification

Integration tests run MCP smoke checks after building the CLI and package. Package and published-package smoke tests import readonly and admin MCP entry points from the installed artifact.

## Operator Notes

Use stdio transport for local agents and provide an explicit Atlas WiKi root or server-side Supabase store for persistent state. For Supabase-backed MCP, run `awiki supabase doctor --json` before exposing the server to confirm migrations and RLS validation RPCs are present.
