import type { ActorRef, ContextPackRecord, SourceRecord } from "../core/records/index.js";

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
  score: number;
}

export interface AtlasWikiStore {
  init(): Promise<void>;
  ingestText(input: IngestInput): Promise<SourceRecord>;
  search(query: string, actor: ActorRef, limit?: number): Promise<SearchResult[]>;
  contextPack(query: string, actor: ActorRef, limit?: number): Promise<ContextPackRecord>;
  validate(): Promise<{ ok: boolean; findings: string[] }>;
  close(): Promise<void>;
}
