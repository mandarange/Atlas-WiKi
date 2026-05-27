import { SupabaseDependencyError } from "./errors.js";
import type { SupabaseLikeClient, SupabaseStoreOptions } from "./types.js";

export async function createSupabaseClient(options: SupabaseStoreOptions): Promise<SupabaseLikeClient> {
  if (options.client) return options.client;
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{ createClient: (url: string, key: string, options?: unknown) => unknown }>;
    const mod = await dynamicImport("@supabase/supabase-js");
    const accessToken = await options.getAccessToken?.();
    return mod.createClient(options.url, options.key, {
      db: { schema: options.schema ?? "atlas_wiki" },
      auth: { persistSession: false, autoRefreshToken: false },
      global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined
    }) as SupabaseLikeClient;
  } catch {
    throw new SupabaseDependencyError();
  }
}
