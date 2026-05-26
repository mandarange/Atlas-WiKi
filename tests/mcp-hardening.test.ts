import { describe, expect, it } from "vitest";
import { adminAtlasWikiToolNames, atlasWikiToolNames, createAdminAtlasWikiServer, createReadonlyAtlasWikiServer, readonlyAtlasWikiToolNames } from "../src/index.js";

describe("MCP hardening", () => {
  it("keeps the default server read-only and splits admin tools explicitly", () => {
    expect(readonlyAtlasWikiToolNames).toContain("atlas_wiki.search");
    expect(readonlyAtlasWikiToolNames).not.toContain("atlas_wiki.ingest");
    expect(readonlyAtlasWikiToolNames).not.toContain("atlas_wiki.backup_create");
    expect(adminAtlasWikiToolNames).toContain("atlas_wiki.ingest");
    expect(adminAtlasWikiToolNames).toContain("atlas_wiki.backup_create");
    expect(atlasWikiToolNames).toContain("atlas_wiki.context_pack");
  });

  it("constructs readonly and admin MCP server instances with separate names", () => {
    expect(createReadonlyAtlasWikiServer({ root: ".atlas-wiki" })).toBeTruthy();
    expect(createAdminAtlasWikiServer({ root: ".atlas-wiki" })).toBeTruthy();
  });
});
