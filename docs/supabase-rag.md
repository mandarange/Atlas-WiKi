# Supabase RAG

Supabase RAG uses the npm-included `supabase/migrations` assets, the `atlas_wiki_default_1536` dimension policy, and database-side `chunk_search` / `rag_search` RPCs. npm-only consumers can set it up without cloning the Atlas WiKi repository:

```bash
npm i -g atlas-wiki
awiki supabase init --out ./supabase --json
npx supabase link --project-ref <project-ref>
npx supabase db push
awiki supabase doctor --json
```

For Gemini-backed Supabase RAG, configure `gemini-embedding-2` with 1536 output dimensions:

```ts
import { GeminiEmbeddingProvider } from "atlas-wiki/rag/gemini";

const embeddingProvider = new GeminiEmbeddingProvider({
  apiKey: process.env.GEMINI_API_KEY,
  model: "gemini-embedding-2",
  dimensions: 1536
});
```

## Core Link

`src/store/supabase/assets.ts` lists and exports migration assets. `src/cli/supabase.ts` exposes `awiki supabase init`, `migrations export`, `migrations list`, `status`, and `doctor`. `src/store/supabase/supabase-store.ts` enforces the 1536-dimension default policy for bundled pgvector RPCs.

## Security

Use anon or publishable keys with RLS for client-facing checks. Service role keys are server-only secrets and must never be used in browser code or public MCP tool inputs. `awiki supabase doctor --service-role` prints a warning and is intended only for server-side operational checks.

## Verification

`tests/supabase-assets.test.ts`, `tests/supabase-store.test.ts`, `scripts/package-smoke.mjs`, and `scripts/published-package-smoke.mjs` verify migration asset listing/export, package tarball inclusion, installed package migration export, and Supabase mock store behavior.

## Operator Notes

If `awiki supabase doctor --json` reports missing `validate_contract` or `migration_report`, run `awiki supabase init --out ./supabase --json` and `npx supabase db push`. If it reports pgvector or `rag_search` findings, confirm the RAG pgvector migration files are present and applied. Custom vector dimensions are an advanced project migration topic; the bundled npm flow is intentionally 1536-only.
