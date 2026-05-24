#!/usr/bin/env node
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { AtlasWiki, actorFromId } from "../sdk/atlas-wiki.js";
import { atlasWikiToolNames, startStdioMcpServer } from "../mcp/server.js";
import { ensureDataRoot } from "../store/sqlite-store.js";
interface ParsedArgs { command: string[]; flags: Map<string, string | boolean>; }
async function main(argv = process.argv.slice(2)): Promise<void> { const args = parseArgs(argv); const root = String(args.flags.get("root") ?? ".atlas-wiki"); const asJson = Boolean(args.flags.get("json")); const [cmd, sub, third] = args.command;
  if (!cmd || cmd === "help" || cmd === "--help") { print("Atlas WiKi CLI: init, doctor, ingest, claim create, search, fetch, context-pack, validate, rebuild-index, freshness report, conflicts scan, export json-shards, import json-shards, backup create|verify, mcp start|smoke", asJson); return; }
  if (cmd === "init") { ensureDataRoot(root); const wiki = await AtlasWiki.open({ root }); await wiki.close(); print({ ok: true, root, db: join(root, "atlas-wiki.sqlite") }, asJson); return; }
  const wiki = await AtlasWiki.open({ root }); try {
    if (cmd === "doctor" || cmd === "validate") { print(await wiki.validate(), asJson); return; }
    if (cmd === "ingest") { if (!sub) throw new Error("ingest requires a file path"); const source = await wiki.ingestFile(sub, { owner: str(args, "owner"), visibility: visibility(args), sensitivity: sensitivity(args), stale_after: str(args, "stale-after") }); print(source, asJson); return; }
    if (cmd === "claim" && sub === "create") { const text = str(args, "text") ?? args.command.slice(2).join(" "); if (!text.trim()) throw new Error("claim create requires --text or positional text"); print(await wiki.proposeClaim({ text, source_id: str(args, "source"), requested_by: actorFromId(str(args, "as")), owner: str(args, "owner") }), asJson); return; }
    if (cmd === "search") { print(await wiki.search(sub ?? str(args, "query") ?? "", actorFromId(str(args, "as")), num(args, "limit")), asJson); return; }
    if (cmd === "fetch") { if (!sub) throw new Error("fetch requires an id"); print(await wiki.fetch(sub, actorFromId(str(args, "as"))) ?? null, asJson); return; }
    if (cmd === "context-pack") { print(await wiki.contextPack(args.command.slice(1).join(" "), actorFromId(str(args, "as")), num(args, "limit")), asJson); return; }
    if (cmd === "rebuild-index") { wiki.store.rebuildIndex(); print({ ok: true, rebuilt: "chunks_fts" }, asJson); return; }
    if (cmd === "freshness" && sub === "report") { const pack = await wiki.contextPack("", actorFromId(str(args, "as")), 100); print({ ok: true, markers: pack.freshness_markers }, asJson); return; }
    if (cmd === "conflicts" && sub === "scan") { const pack = await wiki.contextPack("", actorFromId(str(args, "as")), 100); print({ ok: true, markers: pack.conflict_markers }, asJson); return; }
    if (cmd === "export" && sub === "json-shards") { print({ ok: true, path: wiki.store.exportJsonShards(str(args, "out")) }, asJson); return; }
    if (cmd === "import" && sub === "json-shards") { print({ ok: true, dry_run: Boolean(args.flags.get("dry-run")), path: third ?? null, note: "v0.1 validates import intent; committed import is reserved for approval workflow" }, asJson); return; }
    if (cmd === "backup" && sub === "create") { print({ ok: true, path: await wiki.store.backupCreate() }, asJson); return; }
    if (cmd === "backup" && sub === "verify") { print(wiki.store.backupVerify(), asJson); return; }
    if (cmd === "mcp" && sub === "smoke") { print({ ok: true, stdio: Boolean(args.flags.get("stdio")), tools: atlasWikiToolNames }, asJson); return; }
    if (cmd === "mcp" && sub === "start") { await wiki.close(); if (!args.flags.get("stdio")) throw new Error("v0.1 MCP runtime supports --stdio; HTTP mode is a future deployment adapter."); await startStdioMcpServer({ root }); return; }
    throw new Error("Unknown command: " + args.command.join(" "));
  } finally { await wiki.close(); }}
function parseArgs(argv: string[]): ParsedArgs { const command: string[] = []; const flags = new Map<string, string | boolean>(); for (let i = 0; i < argv.length; i += 1) { const arg = argv[i] ?? ""; if (arg.startsWith("--")) { const key = arg.slice(2); const next = argv[i + 1]; if (next && !next.startsWith("--")) { flags.set(key, next); i += 1; } else flags.set(key, true); } else command.push(arg); } return { command, flags }; }
function str(args: ParsedArgs, key: string): string | undefined { const value = args.flags.get(key); return typeof value === "string" ? value : undefined; }
function num(args: ParsedArgs, key: string): number | undefined { const value = str(args, key); return value ? Number(value) : undefined; }
function visibility(args: ParsedArgs) { const value = str(args, "visibility"); return value === "public" || value === "internal" || value === "private" ? value : undefined; }
function sensitivity(args: ParsedArgs) { const value = str(args, "sensitivity"); return value === "public" || value === "internal" || value === "confidential" || value === "restricted" || value === "secret" ? value : undefined; }
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
