import { createAdminAtlasWikiServer } from "atlas-wiki/mcp/admin";

export const server = createAdminAtlasWikiServer({
  root: ".atlas-wiki",
  actorProvider: async () => ({ id: "service:mcp-admin", type: "service", groups: ["authenticated"] }),
  authorizeTool: async ({ actor, toolName }) => actor.id === "service:mcp-admin" && toolName.startsWith("atlas_wiki.")
});
