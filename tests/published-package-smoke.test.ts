import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("published package smoke script", () => {
  it("installs from the npm registry package spec and checks SDK, CLI, MCP, and release exports", () => {
    const script = readFileSync("scripts/published-package-smoke.mjs", "utf8");
    expect(script).toContain("ATLAS_WIKI_PUBLISHED_SPEC");
    expect(script).toContain("is required for published smoke");
    expect(script).toContain("npm\", [\"install\", \"--silent\", packageSpec]");
    expect(script).toContain("installedPkg.version !== packageVersion");
    expect(script).toContain("AtlasWiki");
    expect(script).toContain("createReadonlyAtlasWikiServer");
    expect(script).toContain("createAdminAtlasWikiServer");
    expect(script).toContain("atlas-wiki.release-evidence.v2");
    expect(script).toContain("npx");
    expect(script).toContain("audit\", \"verify");
    expect(script).toContain("\"rag\", \"index\"");
    expect(script).toContain("\"rag\", \"search\"");
    expect(script).toContain("\"--mode\", \"vector\"");
    expect(script).toContain("manager approval");
  });
});
