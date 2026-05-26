import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki, validateRecord } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-wiki-context-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("context safety hardening", () => {
  it("rejects unknown schemas by default and supports explicit quarantine", () => {
    const unknown = {
      schema: "atlas.wiki.unknown.v1",
      kind: "unknown",
      id: "unknown_1",
      status: "active",
      created_at: "2026-05-26T00:00:00.000Z",
      updated_at: "2026-05-26T00:00:00.000Z",
      revision: 1,
      content_hash: "123456789012"
    };
    expect(() => validateRecord(unknown)).toThrow(/Unknown record schema/);
    expect(validateRecord(unknown, { unknownSchema: "quarantine" }).status).toBe("rejected");
  });

  it("reports denied, redacted, stale, conflict, and fallback metadata without leaking denied content", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "Allowed", text: "remote work token=SECRET123", visibility: "public", stale_after: "2000-01-01T00:00:00.000Z", metadata: { conflict_score: 0.5 } });
    await wiki.ingestText({ title: "Denied", text: "remote work api_key=DENIED_SECRET", visibility: "private", owner: "user:bob@example.com" });

    const pack = await wiki.contextPack("remote OR \"unterminated", actorFromId("user:alice@example.com"));
    expect(pack.candidate_count).toBeGreaterThanOrEqual(2);
    expect(pack.authorized_count).toBe(1);
    expect(pack.denied_count).toBeGreaterThanOrEqual(1);
    expect(pack.redacted_count).toBeGreaterThan(0);
    expect(pack.stale_count).toBe(1);
    expect(pack.conflict_count).toBe(1);
    expect(pack.query_backend).toMatch(/fts5|like_fallback/);
    expect(pack.fallback_reason).toBeTruthy();
    expect(JSON.stringify(pack)).not.toContain("DENIED_SECRET");
    expect(JSON.stringify(pack)).not.toContain("SECRET123");
    await wiki.close();
  });
});
