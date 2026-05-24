import { describe, expect, it } from "vitest";
import { contentHash, defaultAccessPolicy, stableId, validateRecord } from "../src/index.js";

describe("records", () => {
  it("creates deterministic ids and hashes", () => {
    expect(stableId("source", { b: 2, a: 1 })).toBe(stableId("source", { a: 1, b: 2 }));
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }));
  });

  it("validates SourceRecord fixtures", () => {
    const now = new Date().toISOString();
    const source = {
      schema: "atlas.wiki.source.v1",
      kind: "source",
      id: "source_valid",
      status: "active",
      created_at: now,
      updated_at: now,
      revision: 1,
      content_hash: "abc123abc123",
      source_type: "manual",
      title: "Fixture",
      acl: defaultAccessPolicy("public"),
      sensitivity: "public",
      freshness: { updated_at: now }
    };
    expect(validateRecord(source).id).toBe("source_valid");
    expect(() => validateRecord({ ...source, title: "" })).toThrow();
  });
});
