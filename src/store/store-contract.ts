import type { ActorRef, AtlasRecord, ContextPackRecord, PolicyDecision, ProposalRecord, RecordRef, RedactionEvent, SourceRecord, StructuredObjectRecord } from "../core/records/index.js";
import type { StructuredSchemaContract } from "../structured/index.js";

export interface IngestInput {
  title: string;
  text: string;
  uri?: string | undefined;
  owner?: string | undefined;
  visibility?: "public" | "internal" | "private" | undefined;
  sensitivity?: "public" | "internal" | "confidential" | "restricted" | "secret" | undefined;
  stale_after?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface SearchResult {
  source: SourceRecord;
  chunk_id: string;
  text: string;
  redacted: boolean;
  redactions?: RedactionEvent[] | undefined;
  score: number;
}

export type RetrievalBackend = "memory" | "sqlite" | "supabase" | "custom";
export type RetrievalPath = "chunk_scan" | "fts5" | "like_fallback" | "sqlite_vector_json" | "supabase_chunk_rpc" | "supabase_rag_rpc" | "custom";

export interface ChunkSearchInput {
  query: string;
  actor: ActorRef;
  limit?: number | undefined;
}

export interface ChunkSearchResult extends SearchResult {
  backend: RetrievalBackend;
  retrieval_path: RetrievalPath;
}

export interface RagIndexChunk {
  source: SourceRecord;
  chunk_id: string;
  text: string;
  content_hash: string;
}

export interface RagEmbeddingProfile {
  id: string;
  provider_id: string;
  model: string;
  dimensions: number;
  prompt_policy: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface RagChunkEmbedding {
  chunk_id: string;
  profile_id: string;
  provider_id: string;
  model: string;
  dimensions: number;
  content_hash: string;
  vector: number[];
}

export interface RagStoredEmbedding extends RagChunkEmbedding {
  source: SourceRecord;
  text: string;
}

export interface VectorSearchInput {
  query: string;
  queryVector: number[];
  profile: RagEmbeddingProfile;
  actor: ActorRef;
  limit?: number | undefined;
}

export interface VectorSearchResult extends RagStoredEmbedding {
  score: number;
  backend: RetrievalBackend;
  retrieval_path: RetrievalPath;
  profile_id: string;
}

export interface HybridSearchInput extends VectorSearchInput {}
export interface HybridSearchResult extends VectorSearchResult {}

export interface RagVectorStats {
  indexed_chunks: number;
  stale_chunks: number;
}

export interface StructuredIngestInput extends IngestInput {
  schemas?: string[] | undefined;
  mode?: "proposal" | "commit" | undefined;
  actor?: ActorRef | undefined;
  trusted?: boolean | undefined;
}

export interface StructuredIngestResult {
  source: SourceRecord;
  structuredObjects: StructuredObjectRecord[];
  proposals: ProposalRecord[];
  warnings: string[];
}

export interface ProposeClaimInput { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined; }
export type ProposalType = "update" | "deprecate" | "conflict";
export interface ProposeChangeInput { text: string; source_id?: string | undefined; requested_by: ActorRef; owner?: string | undefined; }
export interface WriteOptions { expectedRevision?: number | undefined; actor?: ActorRef | undefined; }
export interface CasWriteOptions extends WriteOptions { expectedRevision: number; allowCreate?: boolean | undefined; }
export interface WriteResult { record: AtlasRecord; created: boolean; previousRevision?: number | undefined; revision: number; }
export interface ValidationReport { ok: boolean; findings: string[]; }
export interface MigrationReport { ok: boolean; user_version?: number | undefined; applied_count?: number | undefined; pending_count?: number | undefined; entries?: unknown[] | undefined; backend?: string | undefined; }
export interface BackupVerifyResult { ok: boolean; backups: string[]; invalid: string[]; }

export interface AtlasWikiStore {
  init(): Promise<void>;
  close(): Promise<void>;
  ingestText(input: IngestInput): Promise<SourceRecord>;
  ingestStructured(input: StructuredIngestInput): Promise<StructuredIngestResult>;
  search(query: string, actor: ActorRef, limit?: number): Promise<SearchResult[]>;
  searchChunks(input: ChunkSearchInput): Promise<ChunkSearchResult[]>;
  vectorSearch(input: VectorSearchInput): Promise<VectorSearchResult[]>;
  hybridSearch?(input: HybridSearchInput): Promise<HybridSearchResult[]>;
  listSources(query: string | undefined, actor: ActorRef, limit?: number): Promise<SourceRecord[]>;
  fetch(id: string, actor: ActorRef): Promise<AtlasRecord | undefined>;
  validateAccess(id: string, actor: ActorRef): Promise<boolean>;
  contextPack(query: string, actor: ActorRef, limit?: number): Promise<ContextPackRecord>;
  proposeClaim(input: ProposeClaimInput): Promise<ProposalRecord>;
  proposeChange(type: ProposalType, input: ProposeChangeInput): Promise<ProposalRecord>;
  upsertRecord(record: AtlasRecord, options?: WriteOptions): Promise<WriteResult>;
  upsertRecordCas(record: AtlasRecord, options: CasWriteOptions): Promise<WriteResult>;
  registerSchemaContract(contract: StructuredSchemaContract): Promise<void>;
  listSchemaContracts(): Promise<StructuredSchemaContract[]>;
  getSchemaContract(id: string): Promise<StructuredSchemaContract | undefined>;
  validate(): Promise<ValidationReport>;
  migrationReport(): MigrationReport | Promise<MigrationReport>;
  listRagIndexChunks(actor: ActorRef, limit?: number): Promise<RagIndexChunk[]>;
  upsertRagEmbeddingProfile(profile: RagEmbeddingProfile): Promise<void>;
  upsertRagChunkEmbedding(embedding: RagChunkEmbedding): Promise<void>;
  listRagChunkEmbeddings(profile: RagEmbeddingProfile, actor: ActorRef, limit?: number): Promise<RagStoredEmbedding[]>;
  ragVectorStats(profile: RagEmbeddingProfile): Promise<RagVectorStats>;
  ragVectorStatsSync?(profile: RagEmbeddingProfile): RagVectorStats;
  backupCreate?(): Promise<string>;
  backupVerify?(): BackupVerifyResult;
  backupRestore?(backupPath: string, overwrite?: boolean): string;
  rebuildIndex?(): void;
  exportJsonShards?(outDir?: string): string;
  audit(event_type: string, actor: ActorRef, refs: RecordRef[], decisions: PolicyDecision[], outcome: "success" | "denied" | "error"): void | Promise<void>;
}
