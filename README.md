# Atlas WiKi

Atlas WiKi is a general-purpose SQLite-first knowledge wiki and ledger for agents, applications, teams, and organizations: source-backed, permission-aware, freshness-scored, conflict-detecting, audit-friendly, and adapter-neutral.

The npm package is `atlas-wiki`. The command line binaries are `awiki` and `atlas-wiki`.

## Install

```bash
npm install atlas-wiki
```

Node.js 24 or newer is required because the default SQLite driver uses `node:sqlite`.

## Quick Start

```bash
awiki init --root ./.atlas-wiki
awiki ingest ./examples/team-handbook/handbook.md --root ./.atlas-wiki --owner team:ops --visibility internal --json
awiki search "remote work" --root ./.atlas-wiki --as user:alice@example.com --json
awiki context-pack "remote work policy" --root ./.atlas-wiki --as user:alice@example.com --json
awiki validate --root ./.atlas-wiki --json
awiki audit verify --root ./.atlas-wiki --json
```

## Public API

```ts
import { AtlasWiki } from "atlas-wiki";
const wiki = await AtlasWiki.open({ root: ".atlas-wiki" });
await wiki.ingestText({ title: "Handbook", text: "Remote work is allowed with manager approval.", owner: "team:ops", visibility: "internal" });
```

## Security Model

Atlas WiKi filters by identity and ACL before context assembly. Unauthorized records are removed before redaction, citation assembly, MCP output, or SDK/CLI JSON output. Write-capable surfaces create proposals unless an explicit approved administrative path is used.

Production hardening includes idempotent checksum-verified migrations, unknown-schema rejection, context-pack safety counters, readonly-by-default MCP, normalized MCP root policy, and canonical audit-chain verification.

Core code is adapter-neutral. Integrations for specific agents, IDEs, SaaS products, or deployment environments belong outside the core package.
