export { createSupabaseClient } from "./client.js";
export { SupabaseDependencyError, SupabaseStoreError } from "./errors.js";
export { SupabaseStore } from "./supabase-store.js";
export {
  createSupabaseProjectScaffold,
  listSupabaseMigrationAssets,
  SUPABASE_DEFAULT_DIMENSION_POLICY,
  SUPABASE_DEFAULT_VECTOR_DIMENSIONS,
  SUPABASE_MIGRATION_FILENAMES,
  SUPABASE_MIGRATION_VERSIONS,
  writeSupabaseMigrations
} from "./assets.js";
export type {
  SupabaseMigrationAsset,
  SupabaseMigrationWriteOptions,
  SupabaseMigrationWriteReport,
  SupabaseMigrationWriteResult,
  SupabaseProjectScaffoldReport
} from "./assets.js";
export type { SupabaseLikeClient, SupabaseQueryBuilder, SupabaseResult, SupabaseStoreOptions } from "./types.js";

import { SupabaseStore } from "./supabase-store.js";
import type { SupabaseStoreOptions } from "./types.js";

export function createSupabaseStore(options: SupabaseStoreOptions): SupabaseStore {
  return new SupabaseStore(options);
}
