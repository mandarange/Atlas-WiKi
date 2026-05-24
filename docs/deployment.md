# Deployment

Atlas WiKi v0.1 is distributed as a TypeScript-first npm package for local Node.js runtimes, CLI usage, SDK embedding, and stdio MCP serving.

## Core Link

`package.json` defines ESM exports, binary entries, package files, provenance policy, and the Node engine. Deployment examples are intentionally adapter-level and keep SQLite as the source of truth.

## Security

Do not expose the SQLite root over an unauthenticated network service. Use process-level secrets only for connectors, and do not store connector credentials in records.

## Verification

`npm run package:dry-run`, `npm run package:smoke`, and `npm audit --omit=dev` validate the publishable artifact and runtime dependency surface.

## Operator Notes

Use `ATLAS_WIKI_ROOT` or `--root` to control state location. For server deployments, mount the data root on durable storage and schedule backups.
