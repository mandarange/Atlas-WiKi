# Supabase Store

`SupabaseStore` is the hosted Postgres adapter for Atlas WiKi. It is exported from `atlas-wiki/supabase` and keeps the same visible `AtlasWikiStore` contract as SQLite and Memory stores.

Use publishable or anon keys with RLS for browser/client reads. Use service role keys only in server-side operational scripts, never in frontend code.

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

Apply the SQL files under `supabase/migrations` with the Supabase CLI in a local or preview environment before using the adapter.
