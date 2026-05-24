import { schemas } from "../dist/schemas/index.js";

if (!Array.isArray(schemas) || schemas.length < 5) throw new Error("Expected schema registry with at least five schemas");
for (const schema of schemas) {
  if (!schema.$id?.startsWith("atlas.wiki.")) throw new Error(`Invalid schema id: ${schema.$id}`);
  if (!schema.required?.length) throw new Error(`Schema lacks required fields: ${schema.$id}`);
}

console.log("schemas ok");
