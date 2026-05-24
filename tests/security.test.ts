import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-wiki-sec-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("security", () => {
  it("filters unauthorized records before search and context pack", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "Public", text: "remote work public", visibility: "public" });
    await wiki.ingestText({ title: "Private", text: "remote work private api_key=SHOULD_NOT_LEAK", visibility: "private", owner: "user:bob@example.com" });

    const alice = actorFromId("user:alice@example.com");
    const search = await wiki.search("remote work", alice);
    expect(search.map((result) => result.source.title)).toEqual(["Public"]);

    const pack = await wiki.contextPack("remote work", alice);
    expect(JSON.stringify(pack)).not.toContain("SHOULD_NOT_LEAK");
    expect(pack.included_refs).toHaveLength(1);
    await wiki.close();
  });

  it("redacts secret-like content from authorized context packs", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "Ops", text: "remote work token=SECRET123 alice@example.com Authorization: Bearer sk-secret123 AKIA1234567890ABCDEF ghp_1234567890abcdefghijklmnop", visibility: "private", owner: "user:alice@example.com" });
    const search = await wiki.search("remote work", actorFromId("user:alice@example.com"));
    expect(JSON.stringify(search)).not.toContain("SECRET123");
    expect(JSON.stringify(search)).not.toContain("sk-secret123");
    expect(search.some((result) => result.redacted)).toBe(true);
    const pack = await wiki.contextPack("remote work", actorFromId("user:alice@example.com"));
    expect(JSON.stringify(pack)).not.toContain("SECRET123");
    expect(JSON.stringify(pack)).not.toContain("sk-secret123");
    expect(JSON.stringify(pack)).not.toContain("AKIA1234567890ABCDEF");
    expect(JSON.stringify(pack)).not.toContain("ghp_1234567890abcdefghijklmnop");
    expect(pack.redactions.length).toBeGreaterThan(0);
    await wiki.close();
  });

  it("detects audit event tampering", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "Audit", text: "audit tamper probe", visibility: "public" });
    await wiki.close();

    const db = new DatabaseSync(join(root, "atlas-wiki.sqlite"));
    try {
      db.prepare("UPDATE audit_events SET outcome = 'denied' WHERE id = (SELECT id FROM audit_events LIMIT 1)").run();
    } finally {
      db.close();
    }

    const reopened = await AtlasWiki.open({ root });
    const validation = await reopened.validate();
    expect(validation.ok).toBe(false);
    expect(validation.findings.some((finding) => finding.startsWith("audit_chain_hash_mismatch"))).toBe(true);
    await reopened.close();
  });
});
