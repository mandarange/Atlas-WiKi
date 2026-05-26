import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AtlasWiki, actorFromId } from "../sdk/atlas-wiki.js";

export const readonlyAtlasWikiToolNames = [
  "atlas_wiki.search",
  "atlas_wiki.fetch",
  "atlas_wiki.context_pack",
  "atlas_wiki.explain_citation",
  "atlas_wiki.check_freshness",
  "atlas_wiki.find_owner",
  "atlas_wiki.find_conflicts",
  "atlas_wiki.list_sources",
  "atlas_wiki.validate_access",
  "atlas_wiki.validate",
  "atlas_wiki.audit_report",
  "atlas_wiki.backup_verify",
  "atlas_wiki.connector_status"
] as const;

export const adminAtlasWikiToolNames = [
  "atlas_wiki.propose_claim",
  "atlas_wiki.propose_update",
  "atlas_wiki.propose_deprecate",
  "atlas_wiki.report_conflict",
  "atlas_wiki.ingest",
  "atlas_wiki.rebuild_index",
  "atlas_wiki.backup_create"
] as const;

export const atlasWikiToolNames = [...readonlyAtlasWikiToolNames, ...adminAtlasWikiToolNames] as const;

export interface AtlasWikiMcpServerOptions {
  root?: string | undefined;
  allowedRoots?: readonly string[] | undefined;
  mode?: "development" | "production" | undefined;
  devAllowRootInput?: boolean | undefined;
  allowActorInput?: boolean | undefined;
  admin?: boolean | undefined;
}

type ToolInput = { root?: string | undefined; as?: string | undefined };

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export function createReadonlyAtlasWikiServer(options: AtlasWikiMcpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "atlas-wiki", version: "0.1.0" });
  registerReadonlyTools(server, options);
  return server;
}

export function createAdminAtlasWikiServer(options: AtlasWikiMcpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "atlas-wiki-admin", version: "0.1.0" });
  registerReadonlyTools(server, options);
  registerAdminTools(server, { ...options, admin: true });
  return server;
}

export function createAtlasWikiMcpServer(options: AtlasWikiMcpServerOptions = {}): McpServer {
  return options.admin ? createAdminAtlasWikiServer(options) : createReadonlyAtlasWikiServer(options);
}

export async function startStdioMcpServer(options: AtlasWikiMcpServerOptions = {}): Promise<void> {
  const server = createAtlasWikiMcpServer(options);
  await server.connect(new StdioServerTransport());
}

function registerReadonlyTools(server: McpServer, options: AtlasWikiMcpServerOptions): void {
  server.registerTool("atlas_wiki.search", { title: "Atlas WiKi Search", description: "ACL-filtered lexical search.", inputSchema: commonSchema({ query: z.string(), limit: z.number().optional() }) }, async (input) => withWiki("search", input, options, async (wiki, actor) => wiki.search(input.query, actor, input.limit)));
  server.registerTool("atlas_wiki.fetch", { title: "Atlas WiKi Fetch", description: "Fetch an allowed record.", inputSchema: commonSchema({ id: z.string() }) }, async (input) => withWiki("fetch", input, options, async (wiki, actor) => wiki.fetch(input.id, actor)));
  server.registerTool("atlas_wiki.context_pack", { title: "Atlas WiKi Context Pack", description: "Build ACL-filtered citation evidence.", inputSchema: commonSchema({ query: z.string(), limit: z.number().optional() }) }, async (input) => withWiki("context_pack", input, options, async (wiki, actor) => wiki.contextPack(input.query, actor, input.limit)));
  server.registerTool("atlas_wiki.explain_citation", { title: "Atlas WiKi Explain Citation", description: "Return citation details from a context pack.", inputSchema: commonSchema({ query: z.string(), citation_id: z.string().optional() }) }, async (input) => withWiki("explain_citation", input, options, async (wiki, actor) => {
    const pack = await wiki.contextPack(input.query, actor);
    return input.citation_id ? pack.citations.filter((citation) => citation.id === input.citation_id) : pack.citations;
  }));
  server.registerTool("atlas_wiki.check_freshness", { title: "Atlas WiKi Check Freshness", description: "Return freshness markers for readable evidence.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }) }, async (input) => withWiki("check_freshness", input, options, async (wiki, actor) => (await wiki.contextPack(input.query ?? "", actor, input.limit)).freshness_markers));
  server.registerTool("atlas_wiki.find_conflicts", { title: "Atlas WiKi Find Conflicts", description: "Return conflict markers for readable evidence.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }) }, async (input) => withWiki("find_conflicts", input, options, async (wiki, actor) => (await wiki.contextPack(input.query ?? "", actor, input.limit)).conflict_markers));
  server.registerTool("atlas_wiki.find_owner", { title: "Atlas WiKi Find Owner", description: "Find owners for readable sources.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }) }, async (input) => withWiki("find_owner", input, options, async (wiki, actor) => {
    const results = await wiki.search(input.query ?? "", actor, input.limit ?? 20);
    return results.map((result) => ({ source_id: result.source.id, title: result.source.title, owner: result.source.owner ?? null }));
  }));
  server.registerTool("atlas_wiki.list_sources", { title: "Atlas WiKi List Sources", description: "List readable sources for an actor.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }) }, async (input) => withWiki("list_sources", input, options, async (wiki, actor) => (await wiki.search(input.query ?? "", actor, input.limit ?? 50)).map((result) => result.source)));
  server.registerTool("atlas_wiki.validate_access", { title: "Atlas WiKi Validate Access", description: "Validate read access without disclosing denied content.", inputSchema: commonSchema({ id: z.string() }) }, async (input) => withWiki("validate_access", input, options, async (wiki, actor) => ({ id: input.id, allowed: Boolean(await wiki.fetch(input.id, actor)) })));
  server.registerTool("atlas_wiki.validate", { title: "Atlas WiKi Validate", description: "Validate schema, SQLite integrity, and audit chain.", inputSchema: commonSchema({}) }, async (input) => withWiki("validate", input, options, async (wiki) => wiki.validate()));
  server.registerTool("atlas_wiki.audit_report", { title: "Atlas WiKi Audit Report", description: "Run validation and return audit-chain findings.", inputSchema: commonSchema({}) }, async (input) => withWiki("audit_report", input, options, async (wiki) => {
    const validation = await wiki.validate();
    return { ok: validation.ok, findings: validation.findings.filter((finding) => finding.startsWith("audit_")) };
  }));
  server.registerTool("atlas_wiki.backup_verify", { title: "Atlas WiKi Backup Verify", description: "Verify backup files restore with core tables.", inputSchema: commonSchema({}) }, async (input) => withWiki("backup_verify", input, options, async (wiki) => wiki.backupVerify()));
  server.registerTool("atlas_wiki.connector_status", { title: "Atlas WiKi Connector Status", description: "Return core connector capability status.", inputSchema: commonSchema({}) }, async (input) => withWiki("connector_status", input, options, async () => ({ ok: true, connectors: [], core_imports_connector_sdks: false })));
}

function registerAdminTools(server: McpServer, options: AtlasWikiMcpServerOptions): void {
  for (const name of ["atlas_wiki.propose_update", "atlas_wiki.propose_deprecate", "atlas_wiki.report_conflict"] as const) {
    server.registerTool(name, { title: name, description: "Create a pending write proposal.", inputSchema: commonSchema({ text: z.string(), source_id: z.string().optional(), owner: z.string().optional() }) }, async (input) => withWiki(name, input, options, async (wiki, actor) => {
      const type = name === "atlas_wiki.propose_update" ? "update" : name === "atlas_wiki.propose_deprecate" ? "deprecate" : "conflict";
      return wiki.proposeChange(type, { text: input.text, source_id: input.source_id, requested_by: actor, owner: input.owner });
    }));
  }
  server.registerTool("atlas_wiki.propose_claim", { title: "Atlas WiKi Propose Claim", description: "Create a pending claim proposal.", inputSchema: commonSchema({ text: z.string(), source_id: z.string().optional(), owner: z.string().optional() }) }, async (input) => withWiki("propose_claim", input, options, async (wiki, actor) => wiki.proposeClaim({ text: input.text, source_id: input.source_id, requested_by: actor, owner: input.owner })));
  server.registerTool("atlas_wiki.ingest", { title: "Atlas WiKi Ingest", description: "Admin-only trusted text ingest.", inputSchema: commonSchema({ title: z.string(), text: z.string(), owner: z.string().optional(), visibility: z.enum(["public", "internal", "private"]).optional() }) }, async (input) => withWiki("ingest", input, options, async (wiki) => wiki.ingestText({ title: input.title, text: input.text, owner: input.owner, visibility: input.visibility })));
  server.registerTool("atlas_wiki.rebuild_index", { title: "Atlas WiKi Rebuild Index", description: "Admin-only FTS projection rebuild.", inputSchema: commonSchema({}) }, async (input) => withWiki("rebuild_index", input, options, async (wiki) => { wiki.rebuildIndex(); return { ok: true, rebuilt: "chunks_fts" }; }));
  server.registerTool("atlas_wiki.backup_create", { title: "Atlas WiKi Backup Create", description: "Admin-only WAL-safe SQLite backup.", inputSchema: commonSchema({}) }, async (input) => withWiki("backup_create", input, options, async (wiki) => ({ ok: true, path: await wiki.backupCreate() })));
}

async function withWiki<T extends ToolInput>(toolName: string, input: T, options: AtlasWikiMcpServerOptions, fn: (wiki: AtlasWiki, actor: ReturnType<typeof actorFromId>) => Promise<unknown> | unknown) {
  const root = resolveMcpRoot(input.root, options);
  const actor = resolveMcpActor(input.as, options);
  const wiki = await AtlasWiki.open({ root });
  try {
    const value = await fn(wiki, actor);
    wiki.store.audit(`mcp.${toolName}`, actor, [], [{ allowed: true, reason: "mcp_tool_call" }], "success");
    return jsonResult(value ?? null);
  } catch (error) {
    wiki.store.audit(`mcp.${toolName}`, actor, [], [{ allowed: false, reason: error instanceof Error ? error.message : String(error) }], "error");
    throw error;
  } finally {
    await wiki.close();
  }
}

function commonSchema<T extends z.ZodRawShape>(shape: T): T & { root: z.ZodOptional<z.ZodString>; as: z.ZodOptional<z.ZodString> } {
  return { ...shape, root: z.string().optional(), as: z.string().optional() };
}

function resolveMcpRoot(inputRoot: string | undefined, options: AtlasWikiMcpServerOptions): string | undefined {
  const mode = options.mode ?? "production";
  if (inputRoot && mode === "production" && !options.devAllowRootInput) throw new Error("MCP production mode rejects tool input root; configure root server-side");
  const root = inputRoot ?? options.root;
  if (!root) {
    if (mode === "production") throw new Error("MCP production mode requires a server-side root");
    return undefined;
  }
  const resolved = resolve(root);
  const allowed = (options.allowedRoots && options.allowedRoots.length > 0 ? options.allowedRoots : [options.root].filter(Boolean) as string[]).map((allowedRoot) => resolve(allowedRoot));
  if (allowed.length > 0 && !allowed.some((allowedRoot) => resolved === allowedRoot || resolved.startsWith(allowedRoot + "/"))) throw new Error("MCP root is outside allowed roots");
  return resolved;
}

function resolveMcpActor(inputActor: string | undefined, options: AtlasWikiMcpServerOptions): ReturnType<typeof actorFromId> {
  const mode = options.mode ?? "production";
  if (inputActor && mode === "production" && !options.allowActorInput && !options.devAllowRootInput) throw new Error("MCP production mode rejects tool input actor; configure actor server-side");
  return actorFromId(inputActor);
}
