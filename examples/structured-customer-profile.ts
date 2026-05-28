import { AtlasWiki, MemoryStore } from "atlas-wiki";

const wiki = await AtlasWiki.open({ store: new MemoryStore() });

await wiki.schema.register({
  id: "customer_profile",
  name: "Customer Profile",
  version: "1",
  jsonSchema: { type: "object", required: ["name", "tier"] },
  requiredFields: ["name", "tier"],
  identityFields: ["name"],
  confidenceThreshold: 0.8,
  conflictKeys: ["name"]
});

const result = await wiki.ingestStructured({
  title: "Customer profile",
  text: [
    "Name: Acme Corp",
    "Tier: Enterprise",
    "Owner: Maya Chen",
    "Renewal Date: 2026-09-30"
  ].join("\n"),
  schemas: ["customer_profile"],
  mode: "proposal"
});

console.log(JSON.stringify({
  structuredObjects: result.structuredObjects.length,
  proposals: result.proposals.length,
  schemaId: result.structuredObjects[0]?.schema_id
}, null, 2));

await wiki.close();
