import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki, extractStructured, MemoryStore, StructuredSchemaContractError } from "../src/index.js";

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "atlas-wiki-structured-"));
  roots.push(path);
  return path;
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("structured ingestion", () => {
  it("extracts deterministic key-value, table, heading, and JSON candidates with provenance", async () => {
    const wiki = await AtlasWiki.open({ root: root() });
    const result = await wiki.ingestStructured({
      title: "Customer notes",
      text: "# Customer\nCustomer: Acme\nPriority: 2\n\n| Field | Value |\n| --- | --- |\n| tier | gold |",
      visibility: "public",
      mode: "proposal",
      actor: actorFromId("alice")
    });
    expect(result.structuredObjects.length).toBeGreaterThanOrEqual(2);
    expect(result.structuredObjects.every((object) => object.evidence_refs.length > 0)).toBe(true);
    expect(result.proposals.length).toBe(result.structuredObjects.length);
    await wiki.close();
  });

  it("requires trusted mode for direct structured commits", async () => {
    const wiki = await AtlasWiki.open({ store: new MemoryStore() });
    await expect(wiki.ingestStructured({ title: "Unsafe", text: "Name: Alice", mode: "commit" })).rejects.toThrow(/trusted/);
    const committed = await wiki.ingestStructured({ title: "Safe", text: "{\"name\":\"Alice\"}", visibility: "public", mode: "commit", trusted: true });
    expect(committed.proposals).toEqual([]);
    expect(committed.structuredObjects[0]?.status).toBe("active");
    await wiki.close();
  });

  it("exposes extractor API independently of stores", async () => {
    const source = await new MemoryStore().ingestText({ title: "JSON", text: "{\"case\":1}", visibility: "public" });
    const candidates = await extractStructured({ source, text: "{\"case\":1}" });
    expect(candidates[0]?.schemaId).toBe("atlas.schema.json.v1");
  });

  it("enforces schema contracts before returning extraction candidates", async () => {
    const store = new MemoryStore();
    const source = await store.ingestText({ title: "Low confidence", text: "Name: Alice", visibility: "public" });
    await expect(extractStructured({ source, text: "Name: Alice" }, [{
      name: "test.low-confidence",
      version: "1",
      supports: () => true,
      extract: () => [{
        objectType: "key_value_document",
        schemaId: "atlas.schema.key-value.v1",
        data: { name: "Alice" },
        confidence: 0.5,
        evidence: [{ sourceId: source.id, quote: "Name: Alice" }],
        warnings: []
      }]
    }])).rejects.toBeInstanceOf(StructuredSchemaContractError);
  });

  it("fails closed for unregistered requested schemas", async () => {
    const wiki = await AtlasWiki.open({ store: new MemoryStore() });
    await expect(wiki.ingestStructured({
      title: "Unregistered customer",
      text: "name: Acme",
      schemas: ["customer_profile"],
      mode: "proposal"
    })).rejects.toThrow(/Missing schema contract for customer_profile/);
    await wiki.close();
  });

  it("registers, lists, gets, and applies custom schema contracts through the SDK facade", async () => {
    const wiki = await AtlasWiki.open({ store: new MemoryStore() });
    await wiki.schema.register({
      id: "customer_profile",
      name: "Customer Profile",
      version: "1",
      jsonSchema: { type: "object", required: ["name"] },
      requiredFields: ["name"],
      identityFields: ["name"],
      confidenceThreshold: 0.8,
      conflictKeys: ["name"]
    });
    expect((await wiki.schema.get("customer_profile"))?.requiredFields).toEqual(["name"]);
    expect((await wiki.schema.list()).map((contract) => contract.id)).toContain("customer_profile");
    const result = await wiki.ingestStructured({
      title: "Registered customer",
      text: "name: Acme",
      schemas: ["customer_profile"],
      mode: "proposal"
    });
    expect(result.structuredObjects[0]?.schema_id).toBe("customer_profile");
    await wiki.close();
  });

  it("keeps README custom schema example bound to the registered schema", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("schemas: [\"customer_profile\"]");
    expect(readme).not.toContain("schemas: [\"customer_profile\", \"support_case\"]");
  });

  it("rejects registered custom schema candidates missing required fields", async () => {
    const wiki = await AtlasWiki.open({ store: new MemoryStore() });
    await wiki.schema.register({
      id: "customer_profile",
      name: "Customer Profile",
      version: "1",
      jsonSchema: { type: "object", required: ["name"] },
      requiredFields: ["name"],
      identityFields: [],
      confidenceThreshold: 0.8,
      conflictKeys: []
    });
    await expect(wiki.ingestStructured({
      title: "Incomplete customer",
      text: "tier: gold",
      schemas: ["customer_profile"],
      mode: "proposal"
    })).rejects.toThrow(/missing required contract fields: name/);
    await wiki.close();
  });
});
