import type { ActorRef } from "../core/records/index.js";
import { parseFile } from "../ingest/parsers/index.js";
import { SqliteStore } from "../store/sqlite-store.js";
import type { IngestInput } from "../store/store-contract.js";
export interface AtlasWikiOptions { root?: string | undefined; }
export class AtlasWiki {
  readonly store: SqliteStore;
  private constructor(root: string) { this.store = new SqliteStore({ root }); }
  static async open(options: AtlasWikiOptions = {}): Promise<AtlasWiki> { const wiki = new AtlasWiki(options.root ?? ".atlas-wiki"); await wiki.init(); return wiki; }
  async init(): Promise<void> { await this.store.init(); }
  async ingestText(input: IngestInput) { return this.store.ingestText(input); }
  async ingestFile(path: string, input: Omit<IngestInput, "title" | "text"> & { title?: string } = {}) { const parsed = parseFile(path); return this.store.ingestText({ ...input, title: input.title ?? parsed.title, text: parsed.text, uri: input.uri ?? path, metadata: { ...parsed.metadata, ...input.metadata } }); }
  async search(query: string, actor: ActorRef, limit?: number) { return this.store.search(query, actor, limit); }
  async fetch(id: string, actor: ActorRef) { return this.store.fetch(id, actor); }
  async contextPack(query: string, actor: ActorRef, limit?: number) { return this.store.contextPack(query, actor, limit); }
  async proposeClaim(input: { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined }) { return this.store.proposeClaim(input); }
  async proposeChange(type: "update" | "deprecate" | "conflict", input: { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined }) { return this.store.proposeChange(type, input); }
  rebuildIndex() { return this.store.rebuildIndex(); }
  async backupCreate() { return this.store.backupCreate(); }
  backupVerify() { return this.store.backupVerify(); }
  exportJsonShards(outDir?: string) { return this.store.exportJsonShards(outDir); }
  async validate() { return this.store.validate(); }
  async close() { await this.store.close(); }
}
export function actorFromId(id?: string): ActorRef { if (!id) return { id: "anonymous", type: "anonymous" }; if (id.startsWith("service:")) return { id, type: "service", groups: ["authenticated"] }; const actorId = id.includes(":") ? id : "user:" + id; return { id: actorId, type: "user", groups: ["authenticated"] }; }
