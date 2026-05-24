# SDK

The SDK exposes `AtlasWiki` as the typed application facade for Node.js consumers.

## Core Link

`src/sdk/atlas-wiki.ts` accepts a store implementation, provides `ingestText`, `search`, `contextPack`, `validate`, `backupCreate`, `backupVerify`, and proposal helpers, and exports typed actors through `actorFromId`.

## Security

SDK methods rely on the same store ACL, audit, and redaction path as CLI and MCP. There is no SDK-only privileged read path.

## Verification

`scripts/type-consumer-smoke.mjs` verifies external ESM type consumption after package build.

## Operator Notes

Instantiate `AtlasWiki.open({ root })` for SQLite-backed usage. Use `MemoryStore` only for tests, examples, or transient embedded flows.
