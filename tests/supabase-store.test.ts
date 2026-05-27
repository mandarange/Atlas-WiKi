import { describe, expect, it } from "vitest";
import { createSupabaseStore } from "../src/index.js";
import type { SupabaseLikeClient, SupabaseQueryBuilder, SupabaseResult } from "../src/store/supabase/index.js";

class MockBuilder implements SupabaseQueryBuilder {
  constructor(private readonly rows: unknown[], private readonly onWrite: (table: string, value: unknown) => void, private readonly table: string) {}
  private filters = new Map<string, unknown>();
  select() { return this; }
  insert(values: unknown) { this.onWrite(this.table, values); return this; }
  upsert(values: unknown) { this.onWrite(this.table, values); return this; }
  update(values: unknown) { this.onWrite(this.table, values); return this; }
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  is(column: string, value: unknown) { this.filters.set(column, value); return this; }
  order() { return this; }
  limit() { return this; }
  async single(): Promise<SupabaseResult> { return { data: this.filtered()[0], error: null }; }
  async maybeSingle(): Promise<SupabaseResult> { return { data: this.filtered()[0] ?? null, error: null }; }
  then<TResult1 = SupabaseResult, TResult2 = never>(onfulfilled?: ((value: SupabaseResult) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.filtered(), error: null }).then(onfulfilled, onrejected);
  }
  private filtered(): unknown[] {
    return this.rows.filter((row) => {
      const record = row as Record<string, unknown>;
      return [...this.filters].every(([key, value]) => value === null ? record[key] == null : record[key] === value);
    });
  }
}

function mockClient(initial: Record<string, unknown[]> = {}) {
  const tables = new Map<string, unknown[]>(Object.entries(initial));
  const writes: Array<{ table: string; value: unknown }> = [];
  const client: SupabaseLikeClient = {
    from(table: string) {
      return new MockBuilder(tables.get(table) ?? [], (target, value) => {
        writes.push({ table: target, value });
        const values = Array.isArray(value) ? value : [value];
        tables.set(target, [...(tables.get(target) ?? []), ...values]);
      }, table);
    }
  };
  return { client, writes };
}

describe("SupabaseStore mock adapter", () => {
  it("imports, initializes with injected client, and writes source rows plus ACL/audit rows", async () => {
    const { client, writes } = mockClient();
    const store = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client, actor: { id: "user:alice@example.com", type: "user", groups: ["authenticated"] } });
    await store.init();
    const source = await store.ingestText({ title: "Supabase", text: "RLS source", owner: "user:alice@example.com", visibility: "private" });
    expect(source.id).toMatch(/^source_/);
    expect(writes.map((write) => write.table)).toEqual(expect.arrayContaining(["records", "sources", "record_acl", "audit_events"]));
    expect(await store.validate()).toEqual({ ok: true, findings: [] });
  });

  it("requires trusted mode for direct structured commits", async () => {
    const { client } = mockClient();
    const store = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client });
    await store.init();
    await expect(store.ingestStructured({ title: "Unsafe", text: "Name: Alice", mode: "commit" })).rejects.toThrow(/trusted/);
  });

  it("applies Atlas actor ACL checks even when the mock client returns rows", async () => {
    const privateSource = {
      schema: "atlas.wiki.source.v1",
      kind: "source",
      id: "source_private",
      status: "active",
      created_at: "2026-05-27T00:00:00.000Z",
      updated_at: "2026-05-27T00:00:00.000Z",
      revision: 1,
      content_hash: "hash_private_source",
      source_type: "manual",
      title: "Private",
      acl: { visibility: "private", grants: [{ principal_type: "user", principal_id: "user:alice@example.com", permission: "read", effect: "allow" }] },
      sensitivity: "internal",
      freshness: {}
    };
    const { client } = mockClient({ records: [{ id: "source_private", kind: "source", deleted_at: null, json: privateSource }] });
    const store = createSupabaseStore({ url: "http://localhost:54321", key: "service", serviceRole: true, client });
    await store.init();
    expect(await store.fetch("source_private", { id: "user:bob@example.com", type: "user", groups: ["authenticated"] })).toBeUndefined();
    expect(await store.fetch("source_private", { id: "user:alice@example.com", type: "user", groups: ["authenticated"] })).toMatchObject({ id: "source_private" });
  });
});
