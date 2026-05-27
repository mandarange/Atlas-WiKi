import type { ActorRef } from "../core/records/index.js";
import { parseFile } from "../ingest/parsers/index.js";
import { RagService } from "../rag/index.js";
import type { RagEmbeddingProvider, RagFallbackPolicy, RagMode } from "../rag/index.js";
import { SqliteStore } from "../store/sqlite-store.js";
import type { AtlasWikiStore, IngestInput, StructuredIngestInput } from "../store/store-contract.js";
export interface AtlasWikiOptions { root?: string | undefined; store?: AtlasWikiStore | undefined; rag?: { embeddingProvider?: RagEmbeddingProvider | undefined; fallbackPolicy?: RagFallbackPolicy | undefined } | undefined; }
export class AtlasWiki {
  readonly store: AtlasWikiStore;
  private readonly ragService: RagService;
  private readonly ragFallbackPolicy: RagFallbackPolicy | undefined;
  private constructor(store: AtlasWikiStore, options: AtlasWikiOptions = {}) { this.store = store; this.ragService = new RagService(store, options.rag?.embeddingProvider); this.ragFallbackPolicy = options.rag?.fallbackPolicy; }
  static async open(options: AtlasWikiOptions = {}): Promise<AtlasWiki> { const wiki = new AtlasWiki(options.store ?? new SqliteStore({ root: options.root ?? ".atlas-wiki" }), options); await wiki.init(); return wiki; }
  async init(): Promise<void> { await this.store.init(); }
  async ingestText(input: IngestInput) { return this.store.ingestText(input); }
  async ingestStructured(input: StructuredIngestInput) { return this.store.ingestStructured(input); }
  async ingestFile(path: string, input: Omit<IngestInput, "title" | "text"> & { title?: string } = {}) { const parsed = parseFile(path); return this.store.ingestText({ ...input, title: input.title ?? parsed.title, text: parsed.text, uri: input.uri ?? path, metadata: { ...parsed.metadata, ...input.metadata } }); }
  async search(query: string, actor: ActorRef, limit?: number) { return this.store.search(query, actor, limit); }
  async listSources(query: string | undefined, actor: ActorRef, limit?: number) { return this.store.listSources(query, actor, limit); }
  async fetch(id: string, actor: ActorRef) { return this.store.fetch(id, actor); }
  async validateAccess(id: string, actor: ActorRef) { return this.store.validateAccess(id, actor); }
  async contextPack(query: string, actor: ActorRef, limit?: number) { return this.store.contextPack(query, actor, limit); }
  async ragSearch(input: { query: string; actor: ActorRef; mode?: RagMode | undefined; fallbackPolicy?: RagFallbackPolicy | undefined; limit?: number | undefined }) { return this.ragService.search({ ...input, fallbackPolicy: input.fallbackPolicy ?? this.ragFallbackPolicy }); }
  async ragContextPack(input: { query: string; actor: ActorRef; mode?: RagMode | undefined; fallbackPolicy?: RagFallbackPolicy | undefined; limit?: number | undefined }) { return this.ragService.contextPack({ ...input, fallbackPolicy: input.fallbackPolicy ?? this.ragFallbackPolicy }); }
  async ragIndex(input: { actor: ActorRef; query?: string | undefined; limit?: number | undefined; fallbackPolicy?: RagFallbackPolicy | undefined }) { return this.ragService.index(input); }
  ragStatus() { return this.ragService.status(); }
  async proposeClaim(input: { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined }) { return this.store.proposeClaim(input); }
  async proposeChange(type: "update" | "deprecate" | "conflict", input: { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined }) { return this.store.proposeChange(type, input); }
  rebuildIndex() { return "rebuildIndex" in this.store && typeof this.store.rebuildIndex === "function" ? this.store.rebuildIndex() : undefined; }
  async backupCreate() { if (!this.store.backupCreate) throw new Error("backupCreate is not supported by this store"); return this.store.backupCreate(); }
  backupVerify() { if (!this.store.backupVerify) throw new Error("backupVerify is not supported by this store"); return this.store.backupVerify(); }
  backupRestore(backupPath: string, overwrite = false) { if (!this.store.backupRestore) throw new Error("backupRestore is not supported by this store"); return this.store.backupRestore(backupPath, overwrite); }
  migrationReport() { return this.store.migrationReport(); }
  exportJsonShards(outDir?: string) { return "exportJsonShards" in this.store && typeof this.store.exportJsonShards === "function" ? this.store.exportJsonShards(outDir) : undefined; }
  async validate() { return this.store.validate(); }
  async close() { await this.store.close(); }
}
export function actorFromId(id?: string): ActorRef { if (!id) return { id: "anonymous", type: "anonymous" }; if (id.startsWith("service:")) return { id, type: "service", groups: ["authenticated"] }; const actorId = id.includes(":") ? id : "user:" + id; return { id: actorId, type: "user", groups: ["authenticated"] }; }
