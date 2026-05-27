import type { SupabaseLikeClient } from "./types.js";
import { SupabaseStoreError } from "./errors.js";

export async function callRpc(client: SupabaseLikeClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  if (!client.rpc) throw new SupabaseStoreError("Supabase RPC is not available on this client", { fn });
  const result = await client.rpc(fn, args);
  if (result.error) throw new SupabaseStoreError(result.error.message, result.error);
  return result.data;
}
