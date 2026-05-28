# Troubleshooting

This page collects the user-facing failure modes that should produce actionable CLI or SDK guidance.

| Symptom | Fix |
| --- | --- |
| `Atlas WiKi requires Node.js 24 or newer` | Install Node.js 24+ and rerun `awiki`. The runtime check is intentional because SQLite mode uses `node:sqlite`. |
| Missing `validate_contract` RPC | Run `awiki supabase init --out ./supabase --json`, then `npx supabase db push`, then `awiki supabase doctor --json`. |
| Missing `migration_report` RPC | Apply the bundled Supabase migrations; this RPC is created by `20260527000900_atlas_wiki_validation_contract.sql`. |
| Missing `rag_search` RPC | Apply `20260527000700_atlas_wiki_rag_pgvector.sql` and `20260527000800_atlas_wiki_n9_rpc_contracts.sql`. |
| Supabase pgvector or dimension mismatch | Use `gemini-embedding-2` with 1536 dimensions for bundled Supabase RAG, or maintain an advanced custom migration. |
| Missing `GEMINI_API_KEY` | Export `GEMINI_API_KEY`, pass `--api-key-env GEMINI_API_KEY`, or configure `awiki setup --provider gemini --api-key-env GEMINI_API_KEY`. |
| Missing schema contract | Register the schema first, for example `await wiki.schema.register({ id: "customer_profile", ... })`, then retry structured extraction. |
| Service role key warning | Keep service role keys in server-only code. Use anon/publishable keys with RLS for browser/client paths. |

## Core Link

`src/cli/awiki.ts` owns the Node 24 runtime error. `src/cli/supabase.ts` owns Supabase doctor findings. `src/rag/providers/gemini.ts`, `src/store/supabase/supabase-store.ts`, and `src/structured/index.ts` own provider, dimension, and schema-contract errors.

## Security

Troubleshooting guidance must not suggest exposing `GEMINI_API_KEY`, Supabase service role keys, or privileged actor impersonation in browser code or public MCP tool schemas.

## Verification

`tests/cli-setup.test.ts`, `tests/rag.test.ts`, `tests/supabase-assets.test.ts`, `tests/supabase-store.test.ts`, and `tests/structured-ingestion.test.ts` cover the main failure paths.

## Operator Notes

Prefer `--json` when filing an issue or attaching doctor output. Redact keys and URLs if they identify a production project.
