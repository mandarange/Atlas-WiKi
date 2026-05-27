export { createSupabaseClient } from "./client.js";
export { SupabaseDependencyError, SupabaseStoreError } from "./errors.js";
export { SupabaseStore } from "./supabase-store.js";
export type { SupabaseLikeClient, SupabaseQueryBuilder, SupabaseResult, SupabaseStoreOptions } from "./types.js";

import { SupabaseStore } from "./supabase-store.js";
import type { SupabaseStoreOptions } from "./types.js";

export function createSupabaseStore(options: SupabaseStoreOptions): SupabaseStore {
  return new SupabaseStore(options);
}
