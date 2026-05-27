import { describe, expect, it } from "vitest";
import { createAdminAtlasWikiServer, createReadonlyAtlasWikiServer } from "../src/index.js";
import type { AtlasWikiToolAuthorizationContext } from "../src/index.js";

describe("MCP production authorization", () => {
  it("keeps production actor and root server-side and denies admin tools without authorizeTool", async () => {
    const readonly = createReadonlyAtlasWikiServer({ root: ".atlas-wiki", actor: "user:alice@example.com" });
    expect(inputKeys(readonly, "atlas_wiki.search")).toEqual(["query", "limit"]);
    expect(registeredToolNames(readonly)).not.toContain("atlas_wiki.ingest");

    const admin = createAdminAtlasWikiServer({ root: ".atlas-wiki", actor: "user:admin@example.com" });
    await expect(handler(admin, "atlas_wiki.ingest")({ title: "Denied", text: "blocked" })).rejects.toThrow(/authorizeTool/);

    const rejected = createAdminAtlasWikiServer({ root: ".atlas-wiki", actor: "user:admin@example.com", authorizeTool: () => false });
    await expect(handler(rejected, "atlas_wiki.backup_create")({})).rejects.toThrow(/authorizeTool/);
  });

  it("allows explicitly authorized admin tools only through the admin server", async () => {
    let seenContext: AtlasWikiToolAuthorizationContext | undefined;
    const admin = createAdminAtlasWikiServer({
      root: ".atlas-wiki",
      actor: "user:admin@example.com",
      authorizeTool: (context: AtlasWikiToolAuthorizationContext) => {
        seenContext = context;
        return context.toolName === "atlas_wiki.rebuild_index" && context.actor.id === "user:admin@example.com";
      }
    });
    expect(registeredToolNames(admin)).toContain("atlas_wiki.rebuild_index");
    await expect(handler(admin, "atlas_wiki.ingest")({ title: "Denied", text: "blocked" })).rejects.toThrow(/authorizeTool/);
    expect(seenContext).toMatchObject({
      toolName: "atlas_wiki.ingest",
      actor: { id: "user:admin@example.com" },
      mode: "production",
      admin: true
    });
    expect(seenContext?.input).toMatchObject({ title: "Denied", text: "blocked" });
  });
});

function registeredToolNames(server: unknown): string[] {
  return Object.keys((server as { _registeredTools: Record<string, unknown> })._registeredTools);
}

function inputKeys(server: unknown, name: string): string[] {
  const schema = ((server as { _registeredTools: Record<string, { inputSchema: unknown }> })._registeredTools[name]?.inputSchema ?? {}) as { _zod?: { def?: { shape?: unknown } } };
  const shape = schema._zod?.def?.shape;
  const resolved = typeof shape === "function" ? shape() : shape;
  return Object.keys((resolved ?? {}) as Record<string, unknown>);
}

function handler(server: unknown, name: string): (input: Record<string, unknown>) => Promise<unknown> {
  return (server as { _registeredTools: Record<string, { handler: (input: Record<string, unknown>) => Promise<unknown> }> })._registeredTools[name]!.handler;
}
