import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki, contentHash, createAdminAtlasWikiServer, createReadonlyAtlasWikiServer } from "../src/index.js";
import type { AccessPolicy, ActorRef, AtlasRecord } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `atlas-wiki-stable-${randomUUID()}`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("stable core release blockers", () => {
  it("denies empty search enumeration while list_sources remains explicit and ACL-filtered", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "Public", text: "shared operations handbook", visibility: "public" });
    await wiki.ingestText({ title: "Private", text: "private operations secret=DENIED", visibility: "private", owner: "user:bob@example.com" });

    const alice = actorFromId("alice");
    expect(await wiki.search("", alice)).toEqual([]);
    const pack = await wiki.contextPack("", alice);
    expect(pack.included_refs).toEqual([]);
    expect(pack.fallback_reason).toBe("empty_query_denied");

    const listed = await wiki.listSources(undefined, alice);
    expect(listed.map((source) => source.title)).toEqual(["Public"]);
    expect(JSON.stringify(listed)).not.toContain("DENIED");
    await wiki.close();
  });

  it("fetches non-source records through AtlasRecord validation and deny-by-default access policy", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.close();

    const alice = actorFromId("alice");
    insertRecord(makeClaim("claim_public", publicAcl()));
    insertRecord(makeEntity("entity_public", publicAcl()));
    insertRecord(makeProposal("proposal_denied", alice));
    insertRecord(makeContextPack("context_denied", alice));

    const reopened = await AtlasWiki.open({ root });
    expect((await reopened.fetch("claim_public", alice))?.kind).toBe("claim");
    expect((await reopened.fetch("entity_public", alice))?.kind).toBe("entity");
    expect(await reopened.validateAccess("claim_public", alice)).toBe(true);
    expect(await reopened.fetch("proposal_denied", alice)).toBeUndefined();
    expect(await reopened.fetch("context_denied", alice)).toBeUndefined();
    expect(await reopened.validateAccess("context_denied", alice)).toBe(false);
    expect(await reopened.validate()).toEqual({ ok: true, findings: [] });
    await reopened.close();
  });

  it("keeps production MCP root and actor out of tool schemas and denies admin tools without authorization", async () => {
    const readonly = createReadonlyAtlasWikiServer({ root, actor: "user:alice@example.com" });
    expect(toolInputKeys(readonly, "atlas_wiki.search")).toEqual(["query", "limit"]);

    const dev = createReadonlyAtlasWikiServer({ root, mode: "development" });
    expect(toolInputKeys(dev, "atlas_wiki.search")).toEqual(["query", "limit", "root", "as"]);

    const admin = createAdminAtlasWikiServer({ root, actor: "user:admin@example.com" });
    await expect(toolHandler(admin, "atlas_wiki.ingest")({ title: "Denied", text: "blocked" })).rejects.toThrow(/authorizeTool/);

    const allowed = createAdminAtlasWikiServer({ root, actor: "user:admin@example.com", authorizeTool: (name) => name === "atlas_wiki.ingest" });
    const result = await toolHandler(allowed, "atlas_wiki.ingest")({ title: "Allowed", text: "committed", visibility: "public" });
    expect(JSON.stringify(result)).toContain("Allowed");
  });

  it("rejects symlink root traversal outside allowed MCP roots", async () => {
    const allowed = join(root, "allowed");
    const outside = join(root, "outside");
    const link = join(allowed, "escape");
    mkdirSync(allowed, { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, link);

    const server = createReadonlyAtlasWikiServer({ mode: "development", allowedRoots: [allowed] });
    await expect(toolHandler(server, "atlas_wiki.validate")({ root: link })).rejects.toThrow(/outside allowed roots/);
  });
});

function publicAcl(): AccessPolicy {
  return { visibility: "public", grants: [{ principal_type: "everyone", principal_id: "*", permission: "read", effect: "allow" }] };
}

function base(schema: AtlasRecord["schema"], kind: AtlasRecord["kind"], id: string): Omit<AtlasRecord, "schema" | "kind"> {
  const time = "2026-05-26T00:00:00.000Z";
  return { id, status: "active", created_at: time, updated_at: time, revision: 1, content_hash: contentHash({ schema, kind, id }) } as Omit<AtlasRecord, "schema" | "kind">;
}

function makeClaim(id: string, acl: AccessPolicy): AtlasRecord {
  return {
    ...base("atlas.wiki.claim.v1", "claim", id),
    schema: "atlas.wiki.claim.v1",
    kind: "claim",
    claim_type: "fact",
    text: "A public claim",
    source_refs: [],
    entity_refs: [],
    acl,
    sensitivity: "public",
    freshness: {},
    trust: { authority_score: 1, confidence_score: 1, conflict_score: 0 }
  };
}

function makeEntity(id: string, acl: AccessPolicy): AtlasRecord {
  return {
    ...base("atlas.wiki.entity.v1", "entity", id),
    schema: "atlas.wiki.entity.v1",
    kind: "entity",
    entity_type: "topic",
    display_name: "Public Entity",
    aliases: [],
    acl
  };
}

function makeProposal(id: string, actor: ActorRef): AtlasRecord {
  return {
    ...base("atlas.wiki.proposal.v1", "proposal", id),
    schema: "atlas.wiki.proposal.v1",
    kind: "proposal",
    status: "pending_approval",
    proposal_type: "claim",
    payload: { text: "private proposal" },
    requested_by: actor,
    approval_status: "pending"
  };
}

function makeContextPack(id: string, actor: ActorRef): AtlasRecord {
  return {
    ...base("atlas.wiki.context-pack.v1", "context_pack", id),
    schema: "atlas.wiki.context-pack.v1",
    kind: "context_pack",
    query: "private",
    actor,
    included_refs: [],
    citations: [],
    redactions: [],
    freshness_markers: [],
    conflict_markers: [],
    policy_decisions: [],
    denied_count: 0,
    redacted_count: 0,
    stale_count: 0,
    conflict_count: 0,
    candidate_count: 0,
    authorized_count: 0,
    query_backend: "none"
  };
}

function insertRecord(record: AtlasRecord): void {
  const db = new DatabaseSync(join(root, "atlas-wiki.sqlite"));
  try {
    db.prepare(
      `INSERT INTO records (id, schema, kind, status, json, content_hash, revision, created_at, updated_at, created_by, updated_by, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
    ).run(record.id, record.schema, record.kind, record.status, JSON.stringify(record), record.content_hash, record.revision, record.created_at, record.updated_at);
  } finally {
    db.close();
  }
}

function toolInputKeys(server: unknown, name: string): string[] {
  const schema = ((server as { _registeredTools: Record<string, { inputSchema: unknown }> })._registeredTools[name]?.inputSchema ?? {}) as { _zod?: { def?: { shape?: unknown } } };
  const shape = schema._zod?.def?.shape;
  const resolved = typeof shape === "function" ? shape() : shape;
  return Object.keys((resolved ?? {}) as Record<string, unknown>);
}

function toolHandler(server: unknown, name: string): (input: Record<string, unknown>) => Promise<unknown> {
  return (server as { _registeredTools: Record<string, { handler: (input: Record<string, unknown>) => Promise<unknown> }> })._registeredTools[name]!.handler;
}
