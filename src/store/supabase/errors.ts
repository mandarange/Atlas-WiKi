import { AtlasWikiError } from "../../core/errors/index.js";

export class SupabaseDependencyError extends AtlasWikiError {
  constructor() {
    super("@supabase/supabase-js is required for SupabaseStore unless a test client is provided", "ATLAS_WIKI_SUPABASE_DEPENDENCY");
    this.name = "SupabaseDependencyError";
  }
}

export class SupabaseStoreError extends AtlasWikiError {
  constructor(message: string, details?: unknown) {
    super(message, "ATLAS_WIKI_SUPABASE_STORE", details);
    this.name = "SupabaseStoreError";
  }
}
