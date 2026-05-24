import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as api from "../src/index.js";

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "atlas-wiki-sdk-"));
  roots.push(path);
  return path;
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("public API, SDK, and validation", () => {
  it("exports the typed public surface expected by consumers", () => {
    expect(api.packageInfo.name).toBe("@mandarange/atlas-wiki");
    expect(api.schemas).toHaveLength(24);
    expect(api.recordSchemaIds).toContain("atlas.wiki.source.v1");
    expect(api.schemaById.get("atlas.wiki.claim.v1")?.$id).toBe("atlas.wiki.claim.v1");
    expect(typeof api.AtlasWiki.open).toBe("function");
    expect(typeof api.actorFromId).toBe("function");
    expect(typeof api.redactText).toBe("function");
  });

  it("runs SDK ingest, search, proposal, backup, export, and validation through SQLite", async () => {
    const wiki = await api.AtlasWiki.open({ root: root() });
    const actor = api.actorFromId("alice");
    const source = await wiki.ingestText({
      title: "Remote Work",
      text: "Remote work policy token=secret allows two days.",
      owner: actor.id,
      visibility: "private"
    });

    const results = await wiki.search("remote", actor);
    expect(results).toHaveLength(1);
    expect(results[0]?.text).toContain("[REDACTED]");

    const pack = await wiki.contextPack("remote", actor);
    expect(pack.citations[0]?.source_ref.id).toBe(source.id);

    const proposal = await wiki.proposeChange("update", { text: "Change remote work days.", source_id: source.id, requested_by: actor });
    expect(proposal.proposal_type).toBe("update");

    wiki.rebuildIndex();
    const backupPath = await wiki.backupCreate();
    expect(backupPath).toContain("sqlite-backups");
    expect(wiki.backupVerify().ok).toBe(true);
    expect(wiki.exportJsonShards()).toContain("records.json");
    expect(await wiki.validate()).toEqual({ ok: true, findings: [] });
    await wiki.close();
  });

  it("rejects invalid records with typed validation errors", () => {
    expect(() => api.validateRecord({ schema: "atlas.wiki.claim.v1", kind: "claim" })).toThrow(/Record validation failed/);
  });
});
