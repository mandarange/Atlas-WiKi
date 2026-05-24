# CLI

Commands: `init`, `doctor`, `ingest`, `claim create`, `search`, `fetch`, `context-pack`, `validate`, `rebuild-index`, `freshness report`, `conflicts scan`, `export json-shards`, `import json-shards`, `backup create|verify`, `mcp start|smoke`. Use `--json` for machine-readable output.

## Core Link

`src/cli/awiki.ts` maps commands to the SDK facade and SQLite store.

## Security

CLI output is subject to the same ACL and redaction rules as SDK and MCP output.

## Verification

Integration and package smoke tests exercise installed CLI execution, ingest, search, context packs, backup, and MCP smoke commands.

## Operator Notes

Use `--root <dir>` or `ATLAS_WIKI_ROOT` to isolate environments.
