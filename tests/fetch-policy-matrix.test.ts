import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki, contentHash } from "../src/index.js";
import type { AccessPolicy, ActorRef, AtlasRecord } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-wiki-fetch-policy-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("source, chunk, claim, proposal, and audit fetch policy matrix", () => {
  it("allows only records with explicit readable policy and denies proposal/audit by default", async () => {
    const wiki = await AtlasWiki.open({ root });
    const source = await wiki.ingestText({ title: "Public", text: "fetch policy public", visibility: "public" });
    const actor = actorFromId("user:alice@example.com");
    await wiki.close();

    insertRecord(makeClaim("claim_public", publicAcl()));
    insertRecord(makeChunk("chunk_public", source.id, publicAcl()));
    insertRecord(makeProposal("proposal_denied", actor));
    insertRecord(makeAudit("audit_denied", actor));

    const reopened = await AtlasWiki.open({ root });
    await expect(reopened.fetch(source.id, actor)).resolves.toMatchObject({ kind: "source" });
    await expect(reopened.fetch("claim_public", actor)).resolves.toMatchObject({ kind: "claim" });
    await expect(reopened.fetch("chunk_public", actor)).resolves.toMatchObject({ kind: "chunk" });
    await expect(reopened.fetch("proposal_denied", actor)).resolves.toBeUndefined();
    await expect(reopened.fetch("audit_denied", actor)).resolves.toBeUndefined();
    await reopened.close();
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

function makeChunk(id: string, sourceId: string, acl: AccessPolicy): AtlasRecord {
  return {
    ...base("atlas.wiki.chunk.v1", "chunk", id),
    schema: "atlas.wiki.chunk.v1",
    kind: "chunk",
    source_ref: { id: sourceId, schema: "atlas.wiki.source.v1", kind: "source" },
    ordinal: 0,
    text: "A public chunk",
    text_hash: contentHash("A public chunk"),
    acl,
    sensitivity: "public"
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

function makeAudit(id: string, actor: ActorRef): AtlasRecord {
  return {
    ...base("atlas.wiki.audit.v1", "audit", id),
    schema: "atlas.wiki.audit.v1",
    kind: "audit",
    event_type: "probe",
    actor,
    record_refs: [],
    policy_decisions: [],
    outcome: "success",
    hash_self: contentHash({ id, actor })
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
