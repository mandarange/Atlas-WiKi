import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSupabaseStore } from "../src/index.js";
import type { SupabaseLikeClient, SupabaseQueryBuilder, SupabaseResult } from "../src/store/supabase/index.js";

const expectedSupabaseMigrations = [
  "20260527000100_atlas_wiki_core",
  "20260527000200_atlas_wiki_rls",
  "20260527000300_atlas_wiki_audit",
  "20260527000400_atlas_wiki_structured_records",
  "20260527000500_atlas_wiki_vector_optional",
  "20260527000600_atlas_wiki_search_rpc",
  "20260527000700_atlas_wiki_rag_pgvector",
  "20260527000800_atlas_wiki_n9_rpc_contracts",
  "20260527000900_atlas_wiki_validation_contract"
];

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

function mockClient(initial: Record<string, unknown[]> = {}, options: { validationFindings?: string[]; pendingMigrations?: string[] } = {}) {
  const tables = new Map<string, unknown[]>(Object.entries(initial));
  const writes: Array<{ table: string; value: unknown }> = [];
  const rpcCalls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const client: SupabaseLikeClient = {
    from(table: string) {
      return new MockBuilder(tables.get(table) ?? [], (target, value) => {
        writes.push({ table: target, value });
        const values = Array.isArray(value) ? value : [value];
        tables.set(target, [...(tables.get(target) ?? []), ...values]);
      }, table);
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      rpcCalls.push(args ? { fn, args } : { fn });
      const rows =
        fn === "upsert_record_cas" ? upsertRecordCasRows(tables, args ?? {}) :
        fn === "rag_search" || fn === "chunk_search" ? ragSearchRows(tables, args ?? {}) :
        fn === "validate_contract" ? validationRows(options.validationFindings ?? []) :
        fn === "migration_report" ? migrationReportRows(args ?? {}, options.pendingMigrations ?? []) :
        [];
      return new MockBuilder(rows, () => {}, `rpc:${fn}`);
    }
  };
  return { client, writes, rpcCalls, tables };
}

function validationRows(findings: string[]): unknown[] {
  return findings.map((finding) => ({ finding }));
}

function migrationReportRows(args: Record<string, unknown>, pending: string[]): unknown[] {
  const expected = Array.isArray(args.expected_versions) ? args.expected_versions.map(String) : expectedSupabaseMigrations;
  return expected.map((version) => ({
    version,
    name: version.replace(/^[0-9]+_/, ""),
    status: pending.includes(version) ? "pending" : "applied",
    applied_at: pending.includes(version) ? null : "2026-05-27T00:00:00.000Z"
  }));
}

function upsertRecordCasRows(tables: Map<string, unknown[]>, args: Record<string, unknown>): unknown[] {
  const record = args.record_json as Record<string, unknown>;
  const expectedRevision = Number(args.expected_revision);
  const records = [...(tables.get("records") ?? [])] as Array<Record<string, unknown>>;
  const index = records.findIndex((row) => row.id === record.id);
  if (index < 0) {
    if (!args.allow_create || expectedRevision !== 0) throw new Error("CAS conflict");
    const revision = Number(record.revision ?? 1);
    const finalRecord: Record<string, unknown> = { ...record, revision };
    records.push({ id: finalRecord["id"], schema: finalRecord["schema"], kind: finalRecord["kind"], status: finalRecord["status"], json: finalRecord, content_hash: finalRecord["content_hash"], revision });
    tables.set("records", records);
    return [{ record_json: finalRecord, created: true, previous_revision: null, revision }];
  }
  const row = records[index]!;
  const actualRevision = Number(row.revision ?? (row.json as Record<string, unknown> | undefined)?.revision);
  if (actualRevision !== expectedRevision) throw new Error("CAS conflict");
  const revision = expectedRevision + 1;
  const finalRecord: Record<string, unknown> = { ...record, revision };
  records[index] = { ...row, schema: finalRecord["schema"], kind: finalRecord["kind"], status: finalRecord["status"], json: finalRecord, content_hash: finalRecord["content_hash"], revision };
  tables.set("records", records);
  return [{ record_json: finalRecord, created: false, previous_revision: actualRevision, revision }];
}

function ragSearchRows(tables: Map<string, unknown[]>, args: Record<string, unknown>): unknown[] {
  const query = String(args.query_text ?? args.search_text ?? "").toLowerCase();
  const limit = Number(args.match_count ?? args.max_results ?? 10);
  const queryVector = Array.isArray(args.query_embedding) ? args.query_embedding as number[] : [1, 0, 0];
  const chunks = tables.get("chunks") ?? [];
  const records = new Map((tables.get("records") ?? []).map((row) => [(row as Record<string, unknown>).id, (row as Record<string, unknown>).json]));
  return chunks
    .filter((row) => String((row as Record<string, unknown>).text ?? "").toLowerCase().includes(query))
    .slice(0, limit)
    .map((row) => {
      const chunk = row as Record<string, unknown>;
      return {
        chunk_id: chunk.id,
        source_id: chunk.source_id,
        source_json: records.get(chunk.source_id),
        text: chunk.text,
        content_hash: chunk.text_hash,
        vector_json: queryVector,
        score: 0.75,
        profile_id: args.target_profile_id ?? "profile_test",
        provider_id: "testing",
        model: "mock",
        dimensions: queryVector.length
      };
    });
}

describe("SupabaseStore mock adapter", () => {
  it("imports, initializes with injected client, and writes source rows plus ACL/audit rows", async () => {
    const { client, writes, rpcCalls } = mockClient();
    const store = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client, actor: { id: "user:alice@example.com", type: "user", groups: ["authenticated"] } });
    await store.init();
    const source = await store.ingestText({ title: "Supabase", text: "RLS source", owner: "user:alice@example.com", visibility: "private" });
    expect(source.id).toMatch(/^source_/);
    expect(writes.map((write) => write.table)).toEqual(expect.arrayContaining(["records", "sources", "chunks", "record_acl", "audit_events"]));
    const search = await store.search("RLS source", { id: "user:alice@example.com", type: "user", groups: ["authenticated"] });
    expect(search[0]).toMatchObject({ source: { id: source.id }, text: "RLS source" });
    expect(rpcCalls[0]).toMatchObject({ fn: "chunk_search", args: expect.objectContaining({ search_text: "RLS source" }) });
    expect(await store.validate()).toEqual({ ok: true, findings: [] });
    expect(await store.migrationReport()).toMatchObject({ ok: true, backend: "supabase", applied_count: expectedSupabaseMigrations.length, pending_count: 0 });
  });

  it("stores and reads mock Supabase RAG embeddings with Atlas policy re-checks", async () => {
    const { client } = mockClient();
    const actor = { id: "user:alice@example.com", type: "user" as const, groups: ["authenticated"] };
    const store = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client, actor });
    await store.init();
    await store.ingestText({ title: "Vector", text: "Supabase chunks back vector search.", owner: actor.id, visibility: "private" });
    const [chunk] = await store.listRagIndexChunks(actor);
    expect(chunk?.text).toContain("vector search");
    const vector = [1, ...Array.from({ length: 1535 }, () => 0)];
    const profile = { id: "profile_test", provider_id: "testing", model: "mock", dimensions: vector.length, prompt_policy: "test" };
    await store.upsertRagEmbeddingProfile(profile);
    await store.upsertRagChunkEmbedding({ chunk_id: chunk!.chunk_id, profile_id: profile.id, provider_id: profile.provider_id, model: profile.model, dimensions: profile.dimensions, content_hash: chunk!.content_hash, vector });
    expect(await store.ragVectorStats(profile)).toEqual({ indexed_chunks: 1, stale_chunks: 0 });
    const embeddings = await store.listRagChunkEmbeddings(profile, actor);
    expect(embeddings[0]).toMatchObject({ chunk_id: chunk!.chunk_id, vector });
    const vectorResults = await store.vectorSearch({ query: "vector search", queryVector: vector, profile, actor });
    expect(vectorResults[0]).toMatchObject({ chunk_id: chunk!.chunk_id, retrieval_path: "supabase_rag_rpc", backend: "supabase", vector });
    expect(await store.listRagChunkEmbeddings(profile, { id: "user:bob@example.com", type: "user", groups: ["authenticated"] })).toEqual([]);
  });

  it("requires trusted mode for direct structured commits", async () => {
    const { client } = mockClient();
    const store = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client });
    await store.init();
    await expect(store.ingestStructured({ title: "Unsafe", text: "Name: Alice", mode: "commit" })).rejects.toThrow(/trusted/);
  });

  it("uses the Supabase CAS RPC for atomic expected-revision writes", async () => {
    const { client, rpcCalls } = mockClient();
    const actor = { id: "user:alice@example.com", type: "user" as const, groups: ["authenticated"] };
    const store = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client, actor });
    await store.init();
    const source = await store.ingestText({ title: "CAS", text: "Supabase CAS", owner: actor.id, visibility: "private" });
    const result = await store.upsertRecordCas({ ...source, title: "CAS updated" }, { actor, expectedRevision: 1 });
    expect(result).toMatchObject({ created: false, previousRevision: 1, revision: 2, record: { title: "CAS updated", revision: 2 } });
    expect(rpcCalls.at(-1)).toMatchObject({ fn: "upsert_record_cas", args: expect.objectContaining({ expected_revision: 1, allow_create: false }) });
  });

  it("reports Supabase validation and migration findings instead of unconditional ok", async () => {
    const pending = "20260527000900_atlas_wiki_validation_contract";
    const { client } = mockClient({}, {
      validationFindings: ["supabase_missing_rpc:rag_search", "supabase_missing_extension:vector"],
      pendingMigrations: [pending]
    });
    const store = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client });
    await store.init();
    expect(await store.validate()).toEqual({ ok: false, findings: ["supabase_missing_extension:vector", "supabase_missing_rpc:rag_search"] });
    expect(await store.migrationReport()).toMatchObject({ ok: false, backend: "supabase", applied_count: expectedSupabaseMigrations.length - 1, pending_count: 1 });
  });

  it("reloads custom schema contracts from Supabase records across store instances", async () => {
    const { client } = mockClient();
    const first = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client });
    await first.init();
    await first.registerSchemaContract({
      id: "support_case",
      name: "Support Case",
      version: "1",
      jsonSchema: { type: "object", required: ["case_id", "summary"] },
      requiredFields: ["case_id", "summary"],
      identityFields: ["case_id"],
      confidenceThreshold: 0.8,
      conflictKeys: ["case_id"]
    });
    const second = createSupabaseStore({ url: "http://localhost:54321", key: "anon", client });
    await second.init();
    expect(await second.getSchemaContract("support_case")).toMatchObject({ id: "support_case", requiredFields: ["case_id", "summary"] });
  });

  it("fails fast when Supabase vector options request non-1536 dimensions", () => {
    expect(() => createSupabaseStore({
      url: "http://localhost:54321",
      key: "anon",
      vector: { enabled: true, dimensions: 1024, metric: "cosine" }
    })).toThrow(/1536 dimensions/);
  });

  it("keeps committed Supabase SQL contracts aligned with ACL and validation evidence", () => {
    const rpcSql = readFileSync("supabase/migrations/20260527000800_atlas_wiki_n9_rpc_contracts.sql", "utf8");
    const validationSql = readFileSync("supabase/migrations/20260527000900_atlas_wiki_validation_contract.sql", "utf8");
    const localSmoke = readFileSync("scripts/supabase-local-test.mjs", "utf8");

    expect(rpcSql).toContain("acl.principal_type = 'authenticated'");
    expect(rpcSql).toContain("atlas_wiki.can_write_record(target_id)");
    expect(rpcSql).toContain("record CAS create denied");
    expect(validationSql).toContain("'audit_events'");
    expect(validationSql).toContain("relforcerowsecurity");
    expect(localSmoke).toContain("atlas_wiki.validate_contract");
    expect(localSmoke).toContain("atlas_wiki.migration_report");
    expect(localSmoke).toContain("upsert_record_cas rejects unauthorized updates");
    expect(localSmoke).toContain("authenticated internal chunk");
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
