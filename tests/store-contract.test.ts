import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { actorFromId, MemoryStore, SqliteStore, WriteConflictError } from "../src/index.js";
import type { AtlasWikiStore } from "../src/index.js";

const roots: string[] = [];

function sqliteStore(): AtlasWikiStore {
  const root = mkdtempSync(join(tmpdir(), "atlas-wiki-store-"));
  roots.push(root);
  return new SqliteStore({ root });
}

function stores(): Array<[string, () => AtlasWikiStore]> {
  return [
    ["memory", () => new MemoryStore()],
    ["sqlite", sqliteStore]
  ];
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.each(stores())("store contract: %s", (_name, createStore) => {
  it("keeps ingest/search/list/fetch/context behavior backend-neutral", async () => {
    const store = createStore();
    await store.init();
    const alice = actorFromId("alice");
    const bob = actorFromId("bob");
    const source = await store.ingestText({ title: "Ops", text: "remote token=secret policy", owner: alice.id, visibility: "private" });

    expect(await store.search("", alice)).toEqual([]);
    expect(await store.search("remote", bob)).toEqual([]);
    expect(await store.search("remote", alice)).toHaveLength(1);
    expect(await store.listSources(undefined, alice)).toHaveLength(1);
    expect(await store.fetch(source.id, bob)).toBeUndefined();
    expect(await store.fetch(source.id, alice)).toMatchObject({ id: source.id });
    const pack = await store.contextPack("remote", alice);
    expect(pack.included_refs[0]?.id).toBe(source.id);
    expect(JSON.stringify(pack)).not.toContain("token=secret");
    expect((await store.validate()).ok).toBe(true);
    await store.close();
  });

  it("guards stale writes with expected revision", async () => {
    const store = createStore();
    await store.init();
    const source = await store.ingestText({ title: "CAS", text: "first", visibility: "public" });
    const first = await store.upsertRecord({ ...source, title: "CAS updated" }, { expectedRevision: 1, actor: actorFromId("alice") });
    expect(first.revision).toBe(2);
    await expect(store.upsertRecord({ ...source, title: "stale" }, { expectedRevision: 1 })).rejects.toThrow(/Write conflict|write conflict/i);
    await store.close();
  });
});
