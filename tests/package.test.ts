import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packageInfo, releaseEvidenceSchema, schemas } from "../src/index.js";

describe("package surface", () => {
  it("matches package metadata and schemas", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; bin: Record<string, string>; exports: Record<string, unknown>; files: string[] };
    expect(pkg.name).toBe(packageInfo.name);
    expect(Object.keys(pkg.bin)).toEqual(["awiki", "atlas-wiki"]);
    expect(pkg.exports).toHaveProperty(".");
    expect(pkg.exports).toHaveProperty("./release");
    expect(releaseEvidenceSchema).toBe("atlas-wiki.release-evidence.v2");
    expect(schemas.map((schema) => schema.$id)).toContain("atlas.wiki.source.v1");
  });

  it("keeps npm-only Supabase setup assets in the package manifest", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { files: string[] };
    expect(pkg.files).toContain("supabase/migrations");
    expect(pkg.files).toContain("examples");
    expect(pkg.files).toContain("!docs/goal");
    for (const filename of [
      "20260527000100_atlas_wiki_core.sql",
      "20260527000200_atlas_wiki_rls.sql",
      "20260527000300_atlas_wiki_audit.sql",
      "20260527000400_atlas_wiki_structured_records.sql",
      "20260527000500_atlas_wiki_vector_optional.sql",
      "20260527000600_atlas_wiki_search_rpc.sql",
      "20260527000700_atlas_wiki_rag_pgvector.sql",
      "20260527000800_atlas_wiki_n9_rpc_contracts.sql",
      "20260527000900_atlas_wiki_validation_contract.sql"
    ]) {
      expect(existsSync(`supabase/migrations/${filename}`)).toBe(true);
    }
  });
});
