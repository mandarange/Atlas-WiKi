# Store Contract

Atlas WiKi exposes a typed store contract for SQLite-backed persistence, Supabase-backed hosted Postgres, memory-backed tests, JSON export, error mapping, events, metrics, and adapter placeholders.

SQLite is the default local CLI and SDK backend. Supabase is the hosted backend for RLS, multi-user/team deployment, optional vector search, and database-side RPC retrieval. npm-only users can create the Supabase project scaffold with `awiki supabase init --out ./supabase --json`; repository users can use the checked-in `supabase/migrations` directory directly.

| Backend | Setup path | Vector dimensions |
| --- | --- | --- |
| SQLite | `awiki init --root ./.atlas-wiki --json` | Any configured test/provider dimension. |
| Supabase | `awiki supabase init`, `npx supabase link`, `npx supabase db push`, `awiki supabase doctor --json` | Bundled policy is `atlas_wiki_default_1536`; custom dimensions require a project migration. |
| Memory | SDK/test construction only | In-memory test vectors only. |

## Core Link

`src/store/store-contract.ts` defines the public store shape, `src/store/sqlite-store.ts` implements durable behavior, `src/store/supabase` implements hosted Postgres/RLS behavior, and `src/store/memory-store.ts` implements lightweight test behavior. `src/capabilities/coverage.ts` maps store capability names to release-gate evidence.

## Security

Store implementations must validate records, preserve ACL projections, redact output snippets, and write audit events for read/write workflows. Supabase deployments must keep RLS active and must never expose service role keys in browser or public MCP tool inputs.

## Verification

`tests/security.test.ts`, `tests/integration.test.ts`, `tests/capability-coverage.test.ts`, `tests/supabase-store.test.ts`, and `tests/supabase-assets.test.ts` cover the store contract, SQLite behavior, Supabase adapter behavior, and npm migration assets.

## Operator Notes

Use SQLite for local persistent state. Use Supabase for hosted team deployments after exported migrations have been reviewed and pushed. Use memory storage only for tests and examples.
