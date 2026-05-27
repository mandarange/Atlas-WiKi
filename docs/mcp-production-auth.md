# MCP Production Auth

Atlas WiKi keeps the default MCP server read-only and requires server-side identity plus explicit admin authorization before any write-capable tool runs.

## Core Link

`src/mcp/server.ts` defines `createReadonlyAtlasWikiServer`, `createAdminAtlasWikiServer`, production root/actor resolution, and the `authorizeTool` gate. `tests/mcp-authz.test.ts` and `tests/mcp-hardening.test.ts` cover the production defaults.

## Security

Production mode rejects tool-supplied `root` and `as` unless development overrides are enabled. Admin tools are not registered on the readonly server. Admin MCP tools fail when `authorizeTool` is missing or returns false.

## Verification

Run:

```bash
npm run test:mcp
npm run test -- tests/mcp-authz.test.ts
```

Package smoke also imports both readonly and admin server constructors from the published package.

## Operator Notes

Only deploy admin MCP with both `actorProvider` or server-side `actor`, and `authorizeTool`. Treat actor input from tools as a development convenience, not a production authentication source.

