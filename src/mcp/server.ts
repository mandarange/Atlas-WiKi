import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ActorRef } from "../core/records/index.js";
import { packageInfo } from "../package-info.js";
import { AtlasWiki, actorFromId } from "../sdk/atlas-wiki.js";

export const readonlyAtlasWikiToolNames = [
  "atlas_wiki.search",
  "atlas_wiki.fetch",
  "atlas_wiki.context_pack",
  "atlas_wiki.rag_search",
  "atlas_wiki.rag_context_pack",
  "atlas_wiki.rag_explain",
  "atlas_wiki.structured_lookup",
  "atlas_wiki.rag_status",
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
  "atlas_wiki.rag_index",
  "atlas_wiki.rag_reindex",
  "atlas_wiki.embedding_profile_create",
  "atlas_wiki.structure_extract",
  "atlas_wiki.structure_commit",
  "atlas_wiki.supabase_migrate",
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
  actor?: ActorRef | string | undefined;
  actorProvider?: (() => ActorRef | string | Promise<ActorRef | string>) | undefined;
  authorizeTool?: AtlasWikiAuthorizeTool | undefined;
  admin?: boolean | undefined;
}

type ToolInput = { root?: string | undefined; as?: string | undefined };
type ResolvedActor = ReturnType<typeof actorFromId>;

export interface AtlasWikiToolAuthorizationContext {
  toolName: string;
  input: Record<string, unknown>;
  actor: ResolvedActor;
  root: string | undefined;
  mode: "development" | "production";
  admin: boolean;
}

export type AtlasWikiAuthorizeTool =
  | ((context: AtlasWikiToolAuthorizationContext) => boolean | Promise<boolean>)
  | ((toolName: string, input: Record<string, unknown>) => boolean | Promise<boolean>);

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export function createReadonlyAtlasWikiServer(options: AtlasWikiMcpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "atlas-wiki", version: packageInfo.version });
  registerReadonlyTools(server, options);
  return server;
}

export function createAdminAtlasWikiServer(options: AtlasWikiMcpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "atlas-wiki-admin", version: packageInfo.version });
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
  server.registerTool("atlas_wiki.search", { title: "Atlas WiKi Search", description: "ACL-filtered lexical search.", inputSchema: commonSchema({ query: z.string(), limit: z.number().optional() }, options) }, async (input) => withWiki("search", input, options, async (wiki, actor) => wiki.search(input.query, actor, input.limit)));
  server.registerTool("atlas_wiki.fetch", { title: "Atlas WiKi Fetch", description: "Fetch an allowed record.", inputSchema: commonSchema({ id: z.string() }, options) }, async (input) => withWiki("fetch", input, options, async (wiki, actor) => wiki.fetch(input.id, actor)));
  server.registerTool("atlas_wiki.context_pack", { title: "Atlas WiKi Context Pack", description: "Build ACL-filtered citation evidence.", inputSchema: commonSchema({ query: z.string(), limit: z.number().optional() }, options) }, async (input) => withWiki("context_pack", input, options, async (wiki, actor) => wiki.contextPack(input.query, actor, input.limit)));
  server.registerTool("atlas_wiki.rag_search", { title: "Atlas WiKi RAG Search", description: "ACL-filtered RAG search with lexical, structured, vector, or hybrid semantics.", inputSchema: commonSchema({ query: z.string(), mode: z.enum(["lexical", "structured", "vector", "hybrid"]).optional(), fallback: z.enum(["error", "degrade", "lexical_only", "structured_only", "testing_deterministic_embeddings"]).optional(), limit: z.number().optional() }, options) }, async (input) => withWiki("rag_search", input, options, async (wiki, actor) => wiki.ragSearch({ query: input.query, actor, mode: input.mode, fallbackPolicy: input.fallback, limit: input.limit })));
  server.registerTool("atlas_wiki.rag_context_pack", { title: "Atlas WiKi RAG Context Pack", description: "Build a context pack with RAG fallback metadata.", inputSchema: commonSchema({ query: z.string(), mode: z.enum(["lexical", "structured", "vector", "hybrid"]).optional(), fallback: z.enum(["error", "degrade", "lexical_only", "structured_only", "testing_deterministic_embeddings"]).optional(), limit: z.number().optional() }, options) }, async (input) => withWiki("rag_context_pack", input, options, async (wiki, actor) => wiki.ragContextPack({ query: input.query, actor, mode: input.mode, fallbackPolicy: input.fallback, limit: input.limit })));
  server.registerTool("atlas_wiki.rag_explain", { title: "Atlas WiKi RAG Explain", description: "Explain RAG score breakdown and fallback metadata.", inputSchema: commonSchema({ query: z.string(), mode: z.enum(["lexical", "structured", "vector", "hybrid"]).optional(), limit: z.number().optional() }, options) }, async (input) => withWiki("rag_explain", input, options, async (wiki, actor) => {
    const result = await wiki.ragSearch({ query: input.query, actor, mode: input.mode, limit: input.limit });
    return { metadata: result.metadata, scores: result.items.map((item) => ({ source_id: item.source_id, chunk_id: item.chunk_id, score_breakdown: item.score_breakdown })) };
  }));
  server.registerTool("atlas_wiki.structured_lookup", { title: "Atlas WiKi Structured Lookup", description: "Search structured evidence through the RAG structured mode.", inputSchema: commonSchema({ query: z.string(), limit: z.number().optional() }, options) }, async (input) => withWiki("structured_lookup", input, options, async (wiki, actor) => wiki.ragSearch({ query: input.query, actor, mode: "structured", limit: input.limit })));
  server.registerTool("atlas_wiki.rag_status", { title: "Atlas WiKi RAG Status", description: "Return embedding provider and vector index status.", inputSchema: commonSchema({}, options) }, async (input) => withWiki("rag_status", input, options, async (wiki) => wiki.ragStatus()));
  server.registerTool("atlas_wiki.explain_citation", { title: "Atlas WiKi Explain Citation", description: "Return citation details from a context pack.", inputSchema: commonSchema({ query: z.string(), citation_id: z.string().optional() }, options) }, async (input) => withWiki("explain_citation", input, options, async (wiki, actor) => {
    const pack = await wiki.contextPack(input.query, actor);
    return input.citation_id ? pack.citations.filter((citation) => citation.id === input.citation_id) : pack.citations;
  }));
  server.registerTool("atlas_wiki.check_freshness", { title: "Atlas WiKi Check Freshness", description: "Return freshness markers for readable evidence.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }, options) }, async (input) => withWiki("check_freshness", input, options, async (wiki, actor) => (await wiki.contextPack(input.query ?? "", actor, input.limit)).freshness_markers));
  server.registerTool("atlas_wiki.find_conflicts", { title: "Atlas WiKi Find Conflicts", description: "Return conflict markers for readable evidence.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }, options) }, async (input) => withWiki("find_conflicts", input, options, async (wiki, actor) => (await wiki.contextPack(input.query ?? "", actor, input.limit)).conflict_markers));
  server.registerTool("atlas_wiki.find_owner", { title: "Atlas WiKi Find Owner", description: "Find owners for readable sources.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }, options) }, async (input) => withWiki("find_owner", input, options, async (wiki, actor) => {
    const sources = await wiki.listSources(input.query, actor, input.limit ?? 20);
    return sources.map((source) => ({ source_id: source.id, title: source.title, owner: source.owner ?? null }));
  }));
  server.registerTool("atlas_wiki.list_sources", { title: "Atlas WiKi List Sources", description: "List readable sources for an actor.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }, options) }, async (input) => withWiki("list_sources", input, options, async (wiki, actor) => wiki.listSources(input.query, actor, input.limit ?? 50)));
  server.registerTool("atlas_wiki.validate_access", { title: "Atlas WiKi Validate Access", description: "Validate read access without disclosing denied content.", inputSchema: commonSchema({ id: z.string() }, options) }, async (input) => withWiki("validate_access", input, options, async (wiki, actor) => ({ id: input.id, allowed: await wiki.validateAccess(input.id, actor) })));
  server.registerTool("atlas_wiki.validate", { title: "Atlas WiKi Validate", description: "Validate schema, SQLite integrity, and audit chain.", inputSchema: commonSchema({}, options) }, async (input) => withWiki("validate", input, options, async (wiki) => wiki.validate()));
  server.registerTool("atlas_wiki.audit_report", { title: "Atlas WiKi Audit Report", description: "Run validation and return audit-chain findings.", inputSchema: commonSchema({}, options) }, async (input) => withWiki("audit_report", input, options, async (wiki) => {
    const validation = await wiki.validate();
    return { ok: validation.ok, findings: validation.findings.filter((finding) => finding.startsWith("audit_")) };
  }));
  server.registerTool("atlas_wiki.backup_verify", { title: "Atlas WiKi Backup Verify", description: "Verify backup files restore with core tables.", inputSchema: commonSchema({}, options) }, async (input) => withWiki("backup_verify", input, options, async (wiki) => wiki.backupVerify()));
  server.registerTool("atlas_wiki.connector_status", { title: "Atlas WiKi Connector Status", description: "Return core connector capability status.", inputSchema: commonSchema({}, options) }, async (input) => withWiki("connector_status", input, options, async () => ({ ok: true, connectors: [], core_imports_connector_sdks: false })));
}

function registerAdminTools(server: McpServer, options: AtlasWikiMcpServerOptions): void {
  for (const name of ["atlas_wiki.propose_update", "atlas_wiki.propose_deprecate", "atlas_wiki.report_conflict"] as const) {
    server.registerTool(name, { title: name, description: "Create a pending write proposal.", inputSchema: commonSchema({ text: z.string(), source_id: z.string().optional(), owner: z.string().optional() }, options) }, async (input) => withAdminWiki(name, input, options, async (wiki, actor) => {
      const type = name === "atlas_wiki.propose_update" ? "update" : name === "atlas_wiki.propose_deprecate" ? "deprecate" : "conflict";
      return wiki.proposeChange(type, { text: input.text, source_id: input.source_id, requested_by: actor, owner: input.owner });
    }));
  }
  server.registerTool("atlas_wiki.propose_claim", { title: "Atlas WiKi Propose Claim", description: "Create a pending claim proposal.", inputSchema: commonSchema({ text: z.string(), source_id: z.string().optional(), owner: z.string().optional() }, options) }, async (input) => withAdminWiki("propose_claim", input, options, async (wiki, actor) => wiki.proposeClaim({ text: input.text, source_id: input.source_id, requested_by: actor, owner: input.owner })));
  server.registerTool("atlas_wiki.ingest", { title: "Atlas WiKi Ingest", description: "Admin-only trusted text ingest.", inputSchema: commonSchema({ title: z.string(), text: z.string(), owner: z.string().optional(), visibility: z.enum(["public", "internal", "private"]).optional() }, options) }, async (input) => withAdminWiki("ingest", input, options, async (wiki) => wiki.ingestText({ title: input.title, text: input.text, owner: input.owner, visibility: input.visibility })));
  server.registerTool("atlas_wiki.rag_index", { title: "Atlas WiKi RAG Index", description: "Admin-only embedding/vector index run.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }, options) }, async (input) => withAdminWiki("rag_index", input, options, async (wiki, actor) => wiki.ragIndex({ actor, query: input.query, limit: input.limit })));
  server.registerTool("atlas_wiki.rag_reindex", { title: "Atlas WiKi RAG Reindex", description: "Admin-only stale/missing embedding reindex run.", inputSchema: commonSchema({ query: z.string().optional(), limit: z.number().optional() }, options) }, async (input) => withAdminWiki("rag_reindex", input, options, async (wiki, actor) => wiki.ragIndex({ actor, query: input.query, limit: input.limit })));
  server.registerTool("atlas_wiki.embedding_profile_create", { title: "Atlas WiKi Embedding Profile Create", description: "Record intended embedding profile metadata.", inputSchema: commonSchema({ provider: z.string(), model: z.string(), dimensions: z.number(), prompt_policy: z.string() }, options) }, async (input) => withAdminWiki("embedding_profile_create", input, options, async () => ({ ok: true, profile: input, note: "Profile persistence is handled by backend migrations/adapters." })));
  server.registerTool("atlas_wiki.structure_extract", { title: "Atlas WiKi Structure Extract", description: "Admin-only deterministic structured extraction proposal.", inputSchema: commonSchema({ title: z.string(), text: z.string(), owner: z.string().optional(), visibility: z.enum(["public", "internal", "private"]).optional() }, options) }, async (input) => withAdminWiki("structure_extract", input, options, async (wiki, actor) => wiki.ingestStructured({ title: input.title, text: input.text, owner: input.owner, visibility: input.visibility, actor, mode: "proposal" })));
  server.registerTool("atlas_wiki.structure_commit", { title: "Atlas WiKi Structure Commit", description: "Admin-only trusted deterministic structured extraction commit.", inputSchema: commonSchema({ title: z.string(), text: z.string(), owner: z.string().optional(), visibility: z.enum(["public", "internal", "private"]).optional() }, options) }, async (input) => withAdminWiki("structure_commit", input, options, async (wiki, actor) => wiki.ingestStructured({ title: input.title, text: input.text, owner: input.owner, visibility: input.visibility, actor, mode: "commit", trusted: true })));
  server.registerTool("atlas_wiki.supabase_migrate", { title: "Atlas WiKi Supabase Migrate", description: "Report Supabase migration intent; execution stays outside MCP tool writes.", inputSchema: commonSchema({}, options) }, async (input) => withAdminWiki("supabase_migrate", input, options, async () => ({ ok: true, note: "Run committed SQL migrations with Supabase CLI in an approved local/branch environment." })));
  server.registerTool("atlas_wiki.rebuild_index", { title: "Atlas WiKi Rebuild Index", description: "Admin-only FTS projection rebuild.", inputSchema: commonSchema({}, options) }, async (input) => withAdminWiki("rebuild_index", input, options, async (wiki) => { wiki.rebuildIndex(); return { ok: true, rebuilt: "chunks_fts" }; }));
  server.registerTool("atlas_wiki.backup_create", { title: "Atlas WiKi Backup Create", description: "Admin-only WAL-safe SQLite backup.", inputSchema: commonSchema({}, options) }, async (input) => withAdminWiki("backup_create", input, options, async (wiki) => ({ ok: true, path: await wiki.backupCreate() })));
}

async function withWiki<T extends ToolInput>(toolName: string, input: T, options: AtlasWikiMcpServerOptions, fn: (wiki: AtlasWiki, actor: ResolvedActor) => Promise<unknown> | unknown) {
  const context = await resolveMcpContext(toolName, input, options, false);
  const wiki = await AtlasWiki.open({ root: context.root });
  try {
    const value = await fn(wiki, context.actor);
    wiki.store.audit(`mcp.${toolName}`, context.actor, [], [{ allowed: true, reason: "mcp_tool_call" }], "success");
    return jsonResult(value ?? null);
  } catch (error) {
    wiki.store.audit(`mcp.${toolName}`, context.actor, [], [{ allowed: false, reason: error instanceof Error ? error.message : String(error) }], "error");
    throw error;
  } finally {
    await wiki.close();
  }
}

async function withAdminWiki<T extends ToolInput>(toolName: string, input: T, options: AtlasWikiMcpServerOptions, fn: (wiki: AtlasWiki, actor: ResolvedActor) => Promise<unknown> | unknown) {
  const context = await resolveMcpContext(toolName, input, options, true);
  await authorizeAdminTool(context, options);
  const wiki = await AtlasWiki.open({ root: context.root });
  try {
    const value = await fn(wiki, context.actor);
    wiki.store.audit(`mcp.${toolName}`, context.actor, [], [{ allowed: true, reason: "mcp_admin_tool_call" }], "success");
    return jsonResult(value ?? null);
  } catch (error) {
    wiki.store.audit(`mcp.${toolName}`, context.actor, [], [{ allowed: false, reason: error instanceof Error ? error.message : String(error) }], "error");
    throw error;
  } finally {
    await wiki.close();
  }
}

async function authorizeAdminTool(context: AtlasWikiToolAuthorizationContext, options: AtlasWikiMcpServerOptions): Promise<void> {
  if (!options.authorizeTool) throw new Error("MCP admin tool denied: configure authorizeTool");
  const legacyToolName = `atlas_wiki.${context.toolName.replace(/^atlas_wiki\./, "")}`;
  const authorized = options.authorizeTool.length >= 2
    ? await (options.authorizeTool as (toolName: string, input: Record<string, unknown>) => boolean | Promise<boolean>)(legacyToolName, context.input)
    : await (options.authorizeTool as (context: AtlasWikiToolAuthorizationContext) => boolean | Promise<boolean>)({ ...context, toolName: legacyToolName });
  if (!authorized) throw new Error("MCP admin tool denied by authorizeTool");
}

async function resolveMcpContext<T extends ToolInput>(toolName: string, input: T, options: AtlasWikiMcpServerOptions, admin: boolean): Promise<AtlasWikiToolAuthorizationContext> {
  const mode = options.mode ?? "production";
  return {
    toolName,
    input,
    actor: await resolveMcpActor(input.as, options),
    root: resolveMcpRoot(input.root, options),
    mode,
    admin
  };
}

function commonSchema<T extends z.ZodRawShape>(shape: T, options: AtlasWikiMcpServerOptions): T & Partial<{ root: z.ZodOptional<z.ZodString>; as: z.ZodOptional<z.ZodString> }> {
  const schema = { ...shape } as T & Partial<{ root: z.ZodOptional<z.ZodString>; as: z.ZodOptional<z.ZodString> }>;
  const mode = options.mode ?? "production";
  if (mode !== "production" || options.devAllowRootInput) schema.root = z.string().optional();
  if (mode !== "production" || options.allowActorInput || options.devAllowRootInput) schema.as = z.string().optional();
  return schema;
}

function resolveMcpRoot(inputRoot: string | undefined, options: AtlasWikiMcpServerOptions): string | undefined {
  const mode = options.mode ?? "production";
  if (inputRoot && mode === "production" && !options.devAllowRootInput) throw new Error("MCP production mode rejects tool input root; configure root server-side");
  const root = inputRoot ?? options.root;
  if (!root) {
    if (mode === "production") throw new Error("MCP production mode requires a server-side root");
    return undefined;
  }
  const resolved = canonicalPath(root);
  const allowed = (options.allowedRoots && options.allowedRoots.length > 0 ? options.allowedRoots : [options.root].filter(Boolean) as string[]).map((allowedRoot) => canonicalPath(allowedRoot));
  if (allowed.length > 0 && !allowed.some((allowedRoot) => isPathInside(resolved, allowedRoot))) throw new Error("MCP root is outside allowed roots");
  return resolved;
}

async function resolveMcpActor(inputActor: string | undefined, options: AtlasWikiMcpServerOptions): Promise<ReturnType<typeof actorFromId>> {
  const mode = options.mode ?? "production";
  if (inputActor && mode === "production" && !options.allowActorInput && !options.devAllowRootInput) throw new Error("MCP production mode rejects tool input actor; configure actor server-side");
  if (inputActor) return actorFromId(inputActor);
  const actor = options.actorProvider ? await options.actorProvider() : options.actor;
  if (actor) return typeof actor === "string" ? actorFromId(actor) : actor;
  if (mode === "production") throw new Error("MCP production mode requires server-side actor or actorProvider");
  return actorFromId(undefined);
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  try {
    return existsSync(resolved) ? realpathSync(resolved) : resolved;
  } catch {
    return resolved;
  }
}

function isPathInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}
