# Atlas WiKi

[![CI](https://github.com/mandarange/Atlas-WiKi/actions/workflows/ci.yml/badge.svg)](https://github.com/mandarange/Atlas-WiKi/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/atlas-wiki.svg)](https://www.npmjs.com/package/atlas-wiki)

Atlas WiKi is a TypeScript-first, backend-neutral knowledge ledger for agents, applications, teams, and organizations. It stores source-backed evidence, converts unstructured text into structured records, preserves provenance and citations, enforces access before context, and remains npm-installable with reproducible local tests.

The npm package is `atlas-wiki`. The command line binaries are `awiki` and `atlas-wiki`.

## Install

SQLite local mode:

```bash
npm install atlas-wiki
```

Hermess or OpenCalw agent/tooling mode:

```bash
npm i -g atlas-wiki
awiki setup
```

When Atlas WiKi is used from Hermess or OpenCalw, the recommended setup is a global install so the `awiki` and `atlas-wiki` binaries are available from any workspace. Keep the project-local install for SDK/library imports.

For non-interactive package or agent bootstrap, use the CLI setup command after install:

```bash
awiki setup --root ./.atlas-wiki --non-interactive --provider gemini --api-key-env GEMINI_API_KEY --write-env-example --json
```

Supabase hosted mode:

```bash
npm install atlas-wiki @supabase/supabase-js
supabase migration up
```

Node.js 24 or newer is required because the default SQLite driver uses `node:sqlite`.

## Backend Comparison

| Backend | Best for | Notes |
| --- | --- | --- |
| SQLite | local first, zero cloud setup, CLI/dev/agent local memory, single-user or small team file sync | Default path and deterministic test baseline. |
| Supabase | hosted Postgres, RLS, multi-user/team deployment, optional vector search, migration workflow | Requires `@supabase/supabase-js` and committed SQL migrations. |
| Memory | tests and contract parity | Not intended for durable data. |

## SQLite Quick Start

```bash
awiki init --root ./.atlas-wiki
awiki ingest ./examples/team-handbook/handbook.md --root ./.atlas-wiki --owner team:ops --visibility internal --json
awiki search "remote work" --root ./.atlas-wiki --as user:alice@example.com --json
awiki context-pack "remote work policy" --root ./.atlas-wiki --as user:alice@example.com --json
awiki validate --root ./.atlas-wiki --json
awiki audit verify --root ./.atlas-wiki --json
```

## Supabase Quick Start

```ts
import { AtlasWiki } from "atlas-wiki";
import { createSupabaseStore } from "atlas-wiki/supabase";

const wiki = await AtlasWiki.open({
  store: createSupabaseStore({
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_ANON_KEY!,
    actor: { id: "user:alice@example.com", type: "user", groups: ["authenticated"] }
  })
});
```

Environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=server-only-never-browser
```

Use anon/publishable keys with RLS for client reads. Service role keys are server-only operational secrets and must never be exposed in browser/client code.

## Supabase Setup

The committed migrations live under `supabase/migrations`:

```txt
20260527000100_atlas_wiki_core.sql
20260527000200_atlas_wiki_rls.sql
20260527000300_atlas_wiki_audit.sql
20260527000400_atlas_wiki_structured_records.sql
20260527000500_atlas_wiki_vector_optional.sql
20260527000600_atlas_wiki_search_rpc.sql
```

RLS is enabled and forced on exposed Atlas tables. Policies use explicit `anon` and `authenticated` scopes, ACL rows, `auth.uid()`, and immutable app metadata claims for team/role checks. Local Supabase service tests are opt-in with `SUPABASE_LOCAL_TESTS=1`; CI runs offline mock coverage through `npm run test:supabase:mock`.

## Structured Extraction

```ts
const result = await wiki.ingestStructured({
  title: "Customer notes",
  text: "...",
  schemas: ["customer_profile", "support_case"],
  mode: "proposal"
});

console.log(result.structuredObjects);
console.log(result.proposals);
```

Built-in deterministic extractors cover JSON, markdown tables, markdown headings, and key-value text. They require no AI provider. Optional AI adapters should live outside core, validate output against schema contracts, and create proposals by default; direct commit requires `trusted: true`.

## RAG

Atlas WiKi 0.1.4 treats RAG as a core wiki capability: search and context packs must return citations, source ids, chunk ids, redaction-safe quotes, and score breakdowns instead of unsupported generated answers. Embeddings improve ranking, but they are optional; without an embedding provider Atlas WiKi still uses lexical and structured retrieval.

Default recommendation: Gemini Embeddings through the optional `atlas-wiki/rag/gemini` adapter. Install the peer dependency only when you want vector or hybrid embedding retrieval:

```bash
npm install atlas-wiki @google/genai
export GEMINI_API_KEY=...
```

```ts
import { AtlasWiki } from "atlas-wiki";
import { GeminiEmbeddingProvider } from "atlas-wiki/rag/gemini";

const wiki = await AtlasWiki.open({
  root: ".atlas-wiki",
  rag: {
    embeddingProvider: new GeminiEmbeddingProvider({
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-embedding-2"
    })
  }
});

await wiki.ragIndex({ actor: { id: "user:alice@example.com", type: "user", groups: ["authenticated"] } });
const result = await wiki.ragSearch({
  query: "remote work policy",
  actor: { id: "user:alice@example.com", type: "user", groups: ["authenticated"] },
  mode: "hybrid"
});
```

`gemini-embedding-2` is the recommended model. `gemini-embedding-001` can be used as a text-only fallback when a deployment needs that model profile. Keep query/document formatting stable for one corpus: Atlas WiKi formats queries as `task: ... | query: ...` and documents as `title: ... | text: ...`; changing model, dimensions, or prompt policy should be treated as a stale embedding profile and reindexed.

RAG modes:

| Mode | Requires embeddings | Behavior |
| --- | --- | --- |
| `lexical` | No | SQLite FTS/Supabase text search plus ACL filtering. |
| `structured` | No | Boosts extracted claims, entities, tables, owners, policy terms, and metadata matches. |
| `vector` | Yes | Fails with `RagVectorUnavailableError` if provider or index is missing. |
| `hybrid` | Optional | Uses vector + lexical + structured when available; otherwise degrades to lexical+structured with `metadata.rag.degraded=true`. |

CLI examples:

```bash
awiki setup
awiki setup --non-interactive --provider gemini --api-key-env GEMINI_API_KEY --write-env-example --json
awiki rag enable --provider gemini --model gemini-embedding-2 --json
awiki rag status --json
awiki rag index --json
awiki rag search "remote work policy" --mode hybrid --json
awiki rag search "remote work policy" --mode vector --json
awiki rag context-pack "remote work policy" --mode hybrid --json
awiki rag disable --json
```

`awiki setup` and `awiki configure` are interactive by default and write `.atlas-wiki/cli-config.json`. They store provider, model, dimensions, fallback policy, and environment variable names, but they do not store API keys. `awiki rag enable` and `awiki rag disable` are shortcut commands for custom CLI/bootstrap flows; after enabling, RAG commands reuse the saved provider settings so package users do not need to repeat `--provider` and `--model` on every command.

MCP read-only tools include `atlas_wiki.rag_search`, `atlas_wiki.rag_context_pack`, `atlas_wiki.rag_explain`, `atlas_wiki.structured_lookup`, and `atlas_wiki.rag_status`. Admin RAG and structure tools require an actor-aware `authorizeTool` callback.

Supabase RAG uses committed SQL migrations under `supabase/migrations`, including pgvector setup, `atlas_wiki.embedding_profiles`, `atlas_wiki.embeddings`, RLS policies, and an RPC-style `atlas_wiki.rag_search(...)` function. Typical setup is:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase db reset
```

Service-role key retrieval is server-only and must re-check Atlas policy after RPC results. Client-side anon/publishable-key retrieval is only appropriate when RLS policies are active. Never expose `GEMINI_API_KEY` or Supabase service-role keys in browser code.

Troubleshooting:

| Symptom | Fix |
| --- | --- |
| missing `GEMINI_API_KEY` | Use `hybrid` with degrade, or configure `GeminiEmbeddingProvider` server-side. |
| vector mode fails | Run `awiki rag index` with a provider; vector mode intentionally does not fallback. |
| model/dimension mismatch | Create a new embedding profile and reindex. |
| stale embeddings | Run `awiki rag reindex --only stale --json`. |
| Supabase RLS returns no rows | Verify actor id/groups claims and Atlas ACL rows. |

Evaluation should track recall@k, MRR, citation precision, and leakage count. For tests, use `DeterministicEmbeddingProvider` from `atlas-wiki/rag/testing`; do not use it as production vector quality evidence.

## Unstructured Examples

Atlas WiKi can ingest handbook pages, meeting notes, support cases, customer notes, policy snippets, markdown tables, JSON payloads, and simple key-value documents. Each structured object includes evidence references back to the source.

## Schema Contracts

The public schema registry includes 31 record families, including `atlas.wiki.structured-object.v1`, `atlas.wiki.extraction-run.v1`, `atlas.wiki.schema-contract.v1`, field observations, table extractions, normalized values, and extraction reviews.

## SDK

```ts
import { AtlasWiki } from "atlas-wiki";

const wiki = await AtlasWiki.open({ root: ".atlas-wiki" });
await wiki.ingestText({
  title: "Handbook",
  text: "Remote work is allowed with manager approval.",
  owner: "team:ops",
  visibility: "internal"
});
```

`AtlasWiki.open({ store })` accepts any `AtlasWikiStore`, including SQLite, Memory, and Supabase adapters.

## CLI

```bash
awiki claim create --text "Remote work needs manager approval" --owner team:ops --as user:alice@example.com --root ./.atlas-wiki --json
awiki migrate report --root ./.atlas-wiki --json
awiki backup create --root ./.atlas-wiki --json
```

## MCP

Readonly MCP is the default. Admin tools require server-side actor resolution and an actor-aware `authorizeTool` callback. Production tool schemas do not expose local `root` or impersonation arguments.

## Security Model

Atlas WiKi filters by identity and ACL before context assembly. Unauthorized records are removed before redaction, citation assembly, MCP output, or SDK/CLI JSON output. Structured extraction preserves provenance, direct commits require explicit trust, and writes support CAS/revision guards.

## Known Limits

Supabase local integration tests are opt-in and require a local Supabase project. Vector search DDL is present as an optional table surface, but production vector ranking remains an adapter extension. Built-in extraction is deterministic and conservative; provider-backed extraction is intentionally outside core.

## Deployment Patterns

Use SQLite for local CLI, local agents, and deterministic development. Use Supabase for hosted team deployments where RLS, migrations, and environment isolation are available. Keep service role keys in server-only deployment environments.

## Testing And Release Gates

```bash
npm run typecheck
npm run build
npm run test
npm run test:security
npm run test:context-leakage
npm run test:mcp
npm run test:audit
npm run test:structured
npm run test:store-contract
npm run test:supabase:mock
npm run package:smoke
npm run release:check
```
