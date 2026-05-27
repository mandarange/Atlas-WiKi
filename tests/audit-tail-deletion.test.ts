import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-wiki-audit-tail-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("audit tail deletion regression", () => {
  it("fails validation when the latest audit row is deleted", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "Tail", text: "audit tail deletion probe", visibility: "public" });
    await wiki.search("tail", actorFromId("user:alice@example.com"));
    await wiki.close();

    const db = new DatabaseSync(join(root, "atlas-wiki.sqlite"));
    try {
      db.prepare("DELETE FROM audit_events WHERE seq = (SELECT MAX(seq) FROM audit_events)").run();
    } finally {
      db.close();
    }

    const reopened = await AtlasWiki.open({ root });
    await expect(reopened.validate()).resolves.toMatchObject({ ok: false, findings: expect.arrayContaining(["audit_head_mismatch"]) });
    await reopened.close();
  });
});
