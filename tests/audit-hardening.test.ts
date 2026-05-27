import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-wiki-audit-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("audit chain hardening", () => {
  it("uses crypto-shaped ids and detects deletion from the hash chain", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "A", text: "audit one", visibility: "public" });
    await wiki.search("audit", actorFromId("alice"));
    await wiki.close();

    const db = new DatabaseSync(join(root, "atlas-wiki.sqlite"));
    try {
      const ids = db.prepare("SELECT id FROM audit_events ORDER BY rowid").all() as Array<{ id: string }>;
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(ids.every((row) => /^audit_[a-f0-9]{32}$/.test(row.id))).toBe(true);
      db.prepare("DELETE FROM audit_events WHERE id = ?").run(ids[0]!.id);
    } finally {
      db.close();
    }

    const reopened = await AtlasWiki.open({ root });
    const validation = await reopened.validate();
    expect(validation.ok).toBe(false);
    expect(validation.findings.some((finding) => finding.startsWith("audit_chain_prev_mismatch"))).toBe(true);
    await reopened.close();
  });

  it("detects deletion of the last audit row through the head checkpoint", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "Tail", text: "audit tail probe", visibility: "public" });
    await wiki.search("tail", actorFromId("alice"));
    await wiki.close();

    const db = new DatabaseSync(join(root, "atlas-wiki.sqlite"));
    try {
      db.prepare("DELETE FROM audit_events WHERE seq = (SELECT MAX(seq) FROM audit_events)").run();
    } finally {
      db.close();
    }

    const reopened = await AtlasWiki.open({ root });
    const validation = await reopened.validate();
    expect(validation.ok).toBe(false);
    expect(validation.findings).toContain("audit_head_mismatch");
    await reopened.close();
  });
});
