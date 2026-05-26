import { contentHash } from "../core/hash/index.js";
import { stableId } from "../core/ids/index.js";
import { defaultAccessPolicy, sourcePolicyDecision } from "../core/policy/index.js";
import type { ActorRef, ContextPackRecord, SourceRecord } from "../core/records/index.js";
import { isPastIso, nowIso } from "../core/time/index.js";
import { redactText } from "../security/redaction.js";
import type { AtlasWikiStore, IngestInput, SearchResult } from "./store-contract.js";

export class MemoryStore implements AtlasWikiStore {
  private sources: Array<{ source: SourceRecord; text: string }> = [];

  async init(): Promise<void> {}

  async ingestText(input: IngestInput): Promise<SourceRecord> {
    const time = nowIso();
    const seed = { title: input.title, text: input.text, uri: input.uri };
    const source: SourceRecord = {
      schema: "atlas.wiki.source.v1",
      kind: "source",
      id: stableId("source", seed),
      status: "active",
      created_at: time,
      updated_at: time,
      revision: 1,
      content_hash: contentHash(seed),
      source_type: "manual",
      title: input.title,
      uri: input.uri,
      owner: input.owner ? { id: input.owner, type: input.owner.startsWith("team:") ? "team" : "user" } : undefined,
      acl: defaultAccessPolicy(input.visibility ?? "private", input.owner),
      sensitivity: input.sensitivity ?? "internal",
      freshness: { updated_at: time, stale_after: input.stale_after },
      metadata: input.metadata
    };
    this.sources.push({ source, text: input.text });
    return source;
  }

  async search(query: string, actor: ActorRef, limit = 10): Promise<SearchResult[]> {
    const q = query.toLowerCase();
    return this.sources
      .filter(({ source }) => sourcePolicyDecision(source, actor).allowed)
      .filter(({ text, source }) => text.toLowerCase().includes(q) || source.title.toLowerCase().includes(q))
      .slice(0, limit)
      .map(({ source, text }) => {
        const redacted = redactText(text, { id: source.id, schema: source.schema, kind: source.kind });
        return { source, chunk_id: `${source.id}_chunk`, text: redacted.text, redacted: redacted.events.length > 0, score: 1 };
      });
  }

  async contextPack(query: string, actor: ActorRef, limit = 10): Promise<ContextPackRecord> {
    const results = await this.search(query, actor, limit);
    const time = nowIso();
    const citations = results.map((result) => {
      const ref = { id: result.source.id, schema: result.source.schema, kind: result.source.kind };
      return { id: stableId("citation", ref), source_ref: ref, title: result.source.title, uri: result.source.uri, quote: redactText(result.text, ref).text.slice(0, 500) };
    });
    const redactions = results.flatMap((result) => redactText(result.text, { id: result.source.id, schema: result.source.schema, kind: result.source.kind }).events);
    const freshness_markers = results.map((result) => ({
      record_ref: { id: result.source.id, schema: result.source.schema, kind: result.source.kind },
      stale: isPastIso(result.source.freshness.stale_after),
      stale_after: result.source.freshness.stale_after
    }));
    return {
      schema: "atlas.wiki.context-pack.v1",
      kind: "context_pack",
      id: stableId("context_pack", { query, actor, refs: results.map((result) => result.source.id) }),
      status: "active",
      created_at: time,
      updated_at: time,
      revision: 1,
      content_hash: contentHash({ query, actor, results: results.map((result) => result.source.id) }),
      query,
      actor,
      included_refs: results.map((result) => ({ id: result.source.id, schema: result.source.schema, kind: result.source.kind })),
      citations,
      redactions,
      freshness_markers,
      conflict_markers: [],
      policy_decisions: results.map((result) => ({ record_ref: { id: result.source.id, schema: result.source.schema, kind: result.source.kind }, allowed: true, reason: "acl_allow" })),
      denied_count: 0,
      redacted_count: redactions.length,
      stale_count: freshness_markers.filter((marker) => marker.stale).length,
      conflict_count: 0,
      candidate_count: results.length,
      authorized_count: results.length,
      query_backend: "none",
      fallback_reason: null
    };
  }

  async validate(): Promise<{ ok: boolean; findings: string[] }> {
    return { ok: true, findings: [] };
  }

  async close(): Promise<void> {}
}
