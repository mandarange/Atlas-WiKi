#!/usr/bin/env node
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { DeterministicEmbeddingProvider } from "../rag/index.js";
import type { RagFallbackPolicy, RagMode } from "../rag/index.js";
import { GeminiEmbeddingProvider } from "../rag/providers/gemini.js";
import { AtlasWiki, actorFromId } from "../sdk/atlas-wiki.js";
import { adminAtlasWikiToolNames, atlasWikiToolNames, readonlyAtlasWikiToolNames, startStdioMcpServer } from "../mcp/server.js";
import { ensureDataRoot } from "../store/sqlite-store.js";
import { configureRag, readCliConfig, runInteractiveSetup } from "./setup.js";
import type { AtlasWikiCliConfig } from "./setup.js";
interface ParsedArgs { command: string[]; flags: Map<string, string | boolean>; }
async function main(argv = process.argv.slice(2)): Promise<void> { const args = parseArgs(argv); const root = String(args.flags.get("root") ?? ".atlas-wiki"); const asJson = Boolean(args.flags.get("json")); const [cmd, sub, third] = args.command;
  if (!cmd || cmd === "help" || cmd === "--help") { print("Atlas WiKi CLI: init, setup|configure, doctor, ingest, claim create, search, fetch, context-pack, validate, migrate report, audit verify, rebuild-index, freshness report, conflicts scan, export json-shards, import json-shards, backup create|verify|restore, rag status|enable|disable|index|search|context-pack|eval, mcp start|smoke", asJson); return; }
  if (cmd === "setup" || cmd === "configure") { print(await runInteractiveSetup({ root, flags: args.flags }), asJson); return; }
  if (cmd === "rag" && sub === "enable") { print(configureRag(root, args.flags, true), asJson); return; }
  if (cmd === "rag" && sub === "disable") { print(configureRag(root, args.flags, false), asJson); return; }
  if (cmd === "init") { ensureDataRoot(root); const wiki = await AtlasWiki.open({ root }); await wiki.close(); print({ ok: true, root, db: join(root, "atlas-wiki.sqlite") }, asJson); return; }
  const cliConfig = readCliConfig(root);
  const requireEmbedding = cmd === "rag" && (sub === "index" || sub === "reindex" || ragMode(args) === "vector");
  const wiki = await AtlasWiki.open({ root, rag: { embeddingProvider: createEmbeddingProvider(args, cliConfig, requireEmbedding), fallbackPolicy: fallbackPolicy(args, cliConfig) } }); try {
    if (cmd === "doctor" || cmd === "validate") { print(await wiki.validate(), asJson); return; }
    if (cmd === "migrate" && sub === "report") { print(wiki.migrationReport(), asJson); return; }
    if (cmd === "audit" && sub === "verify") { const validation = await wiki.validate(); print({ ok: validation.ok, findings: validation.findings.filter((finding) => finding.startsWith("audit_")) }, asJson); return; }
    if (cmd === "ingest") { if (!sub) throw new Error("ingest requires a file path"); const source = await wiki.ingestFile(sub, { owner: str(args, "owner"), visibility: visibility(args), sensitivity: sensitivity(args), stale_after: str(args, "stale-after") }); print(source, asJson); return; }
    if (cmd === "claim" && sub === "create") { const text = str(args, "text") ?? args.command.slice(2).join(" "); if (!text.trim()) throw new Error("claim create requires --text or positional text"); print(await wiki.proposeClaim({ text, source_id: str(args, "source"), requested_by: actorFromId(str(args, "as")), owner: str(args, "owner") }), asJson); return; }
    if (cmd === "search") { print(await wiki.search(sub ?? str(args, "query") ?? "", actorFromId(str(args, "as")), num(args, "limit")), asJson); return; }
    if (cmd === "fetch") { if (!sub) throw new Error("fetch requires an id"); print(await wiki.fetch(sub, actorFromId(str(args, "as"))) ?? null, asJson); return; }
    if (cmd === "context-pack") { print(await wiki.contextPack(args.command.slice(1).join(" "), actorFromId(str(args, "as")), num(args, "limit")), asJson); return; }
    if (cmd === "rag") {
      const actor = actorFromId(str(args, "as"));
      if (sub === "status") { print({ ...wiki.ragStatus(), config: cliConfig?.rag ?? null, config_path: cliConfig ? join(root, "cli-config.json") : null }, asJson); return; }
      if (sub === "index" || sub === "reindex") { print(await wiki.ragIndex({ actor, limit: num(args, "limit"), fallbackPolicy: fallbackPolicy(args, cliConfig) }), asJson); return; }
      if (sub === "search") { const query = third ?? str(args, "query") ?? args.command.slice(2).join(" "); print(await wiki.ragSearch({ query, actor, mode: ragMode(args), fallbackPolicy: fallbackPolicy(args, cliConfig), limit: num(args, "limit") }), asJson); return; }
      if (sub === "context-pack") { const query = third ?? str(args, "query") ?? args.command.slice(2).join(" "); print(await wiki.ragContextPack({ query, actor, mode: ragMode(args), fallbackPolicy: fallbackPolicy(args, cliConfig), limit: num(args, "limit") }), asJson); return; }
      if (sub === "eval") { print({ ok: true, path: third ?? null, metrics: { recall_at_k: null, mrr: null, citation_precision: null, leakage_count: null }, note: "RAG eval harness placeholder records the contract; scored datasets plug into release gates." }, asJson); return; }
      throw new Error("Unknown rag command: " + args.command.join(" "));
    }
    if (cmd === "rebuild-index") { if (!wiki.store.rebuildIndex) throw new Error("rebuild-index is not supported by this store"); wiki.store.rebuildIndex(); print({ ok: true, rebuilt: "chunks_fts" }, asJson); return; }
    if (cmd === "freshness" && sub === "report") { const pack = await wiki.contextPack("", actorFromId(str(args, "as")), 100); print({ ok: true, markers: pack.freshness_markers }, asJson); return; }
    if (cmd === "conflicts" && sub === "scan") { const pack = await wiki.contextPack("", actorFromId(str(args, "as")), 100); print({ ok: true, markers: pack.conflict_markers }, asJson); return; }
    if (cmd === "export" && sub === "json-shards") { if (!wiki.store.exportJsonShards) throw new Error("json-shards export is not supported by this store"); print({ ok: true, path: wiki.store.exportJsonShards(str(args, "out")) }, asJson); return; }
    if (cmd === "import" && sub === "json-shards") { print({ ok: true, dry_run: Boolean(args.flags.get("dry-run")), path: third ?? null, note: "v0.1 validates import intent; committed import is reserved for approval workflow" }, asJson); return; }
    if (cmd === "backup" && sub === "create") { if (!wiki.store.backupCreate) throw new Error("backup create is not supported by this store"); print({ ok: true, path: await wiki.store.backupCreate() }, asJson); return; }
    if (cmd === "backup" && sub === "verify") { if (!wiki.store.backupVerify) throw new Error("backup verify is not supported by this store"); print(wiki.store.backupVerify(), asJson); return; }
    if (cmd === "backup" && sub === "restore") { const input = str(args, "in") ?? third; if (!input) throw new Error("backup restore requires --in <backup.sqlite>"); print({ ok: true, path: wiki.backupRestore(input, Boolean(args.flags.get("force"))) }, asJson); return; }
    if (cmd === "mcp" && sub === "smoke") { const admin = Boolean(args.flags.get("admin")); print({ ok: true, stdio: Boolean(args.flags.get("stdio")), mode: admin ? "admin" : "readonly", tools: admin ? adminAtlasWikiToolNames : readonlyAtlasWikiToolNames, all_tools: atlasWikiToolNames }, asJson); return; }
    if (cmd === "mcp" && sub === "start") { await wiki.close(); if (!args.flags.get("stdio")) throw new Error("v0.1 MCP runtime supports --stdio; HTTP mode is a future deployment adapter."); await startStdioMcpServer({ root, admin: Boolean(args.flags.get("admin")), devAllowRootInput: Boolean(args.flags.get("dev-allow-root-input")) }); return; }
    throw new Error("Unknown command: " + args.command.join(" "));
  } finally { await wiki.close(); }}
function parseArgs(argv: string[]): ParsedArgs { const command: string[] = []; const flags = new Map<string, string | boolean>(); for (let i = 0; i < argv.length; i += 1) { const arg = argv[i] ?? ""; if (arg.startsWith("--")) { const key = arg.slice(2); const next = argv[i + 1]; if (next && !next.startsWith("--")) { flags.set(key, next); i += 1; } else flags.set(key, true); } else command.push(arg); } return { command, flags }; }
function str(args: ParsedArgs, key: string): string | undefined { const value = args.flags.get(key); return typeof value === "string" ? value : undefined; }
function num(args: ParsedArgs, key: string): number | undefined { const value = str(args, key); return value ? Number(value) : undefined; }
function visibility(args: ParsedArgs) { const value = str(args, "visibility"); return value === "public" || value === "internal" || value === "private" ? value : undefined; }
function sensitivity(args: ParsedArgs) { const value = str(args, "sensitivity"); return value === "public" || value === "internal" || value === "confidential" || value === "restricted" || value === "secret" ? value : undefined; }
function ragMode(args: ParsedArgs): RagMode | undefined { const value = str(args, "mode"); return value === "lexical" || value === "structured" || value === "vector" || value === "hybrid" ? value : undefined; }
function fallbackPolicy(args: ParsedArgs, config?: AtlasWikiCliConfig): RagFallbackPolicy | undefined {
  const value = str(args, "fallback");
  return value === "error" || value === "degrade" || value === "lexical_only" || value === "structured_only" || value === "testing_deterministic_embeddings" ? value : config?.rag.fallbackPolicy;
}
function createEmbeddingProvider(args: ParsedArgs, config?: AtlasWikiCliConfig, requireProvider = false) {
  const provider = str(args, "provider") ?? (config?.rag.enabled ? config.rag.provider : undefined);
  const fallback = fallbackPolicy(args, config);
  const dimensions = num(args, "dimensions") ?? config?.rag.dimensions;
  if (provider === "testing" || fallback === "testing_deterministic_embeddings") return new DeterministicEmbeddingProvider(dimensions ?? 32);
  if (provider === "gemini") {
    const apiKeyEnv = str(args, "api-key-env") ?? config?.rag.apiKeyEnv ?? "GEMINI_API_KEY";
    const apiKey = str(args, "api-key") ?? process.env[apiKeyEnv];
    if (!apiKey && requireProvider) throw new Error(`${apiKeyEnv} is required for Gemini RAG. Run awiki setup or export ${apiKeyEnv}.`);
    if (!apiKey) return undefined;
    return new GeminiEmbeddingProvider({ apiKey, model: str(args, "model") ?? config?.rag.model, dimensions });
  }
  return undefined;
}
function print(value: unknown, asJson: boolean): void {
  if (asJson || typeof value !== "string") process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else process.stdout.write(`${value}\n`);
}

export { main };

if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || ["awiki", "atlas-wiki"].includes(basename(process.argv[1])))) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
