import type { ActorRef } from "../../core/records/index.js";

export interface SupabaseStoreOptions {
  url: string;
  key: string;
  schema?: "public" | "atlas_wiki" | undefined;
  serviceRole?: boolean | undefined;
  actor?: ActorRef | undefined;
  getAccessToken?: (() => string | Promise<string>) | undefined;
  client?: SupabaseLikeClient | undefined;
  vector?: {
    enabled: boolean;
    /**
     * Atlas WiKi's bundled Supabase pgvector RPC migrations are 1536-only.
     * Other dimensions require a project-specific migration and are rejected
     * by this adapter until that migration exposes matching RPC contracts.
     */
    dimensions: number;
    dimensionPolicy?: "atlas_wiki_default_1536" | undefined;
    metric: "cosine" | "inner_product" | "l2";
  } | undefined;
  migrations?: {
    autoApply?: false | undefined;
    expectedVersion?: string | undefined;
  } | undefined;
}

export interface SupabaseLikeClient {
  from(table: string): SupabaseQueryBuilder;
  rpc?(fn: string, args?: Record<string, unknown>): SupabaseQueryBuilder;
}

export interface SupabaseQueryBuilder {
  select(columns?: string): SupabaseQueryBuilder;
  insert(values: unknown): SupabaseQueryBuilder;
  upsert(values: unknown): SupabaseQueryBuilder;
  update(values: unknown): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  is(column: string, value: unknown): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean | undefined }): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  single(): Promise<SupabaseResult>;
  maybeSingle(): Promise<SupabaseResult>;
  then<TResult1 = SupabaseResult, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2>;
}

export interface SupabaseResult {
  data: unknown;
  error: { message: string; code?: string | undefined } | null;
  count?: number | null | undefined;
}
