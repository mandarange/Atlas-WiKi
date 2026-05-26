import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actorFromId, AtlasWiki } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-wiki-int-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("integration", () => {
  it("builds stale and conflict markers and audit events", async () => {
    const wiki = await AtlasWiki.open({ root });
    await wiki.ingestText({ title: "Old Policy", text: "원격근무 policy", visibility: "public", stale_after: "2000-01-01T00:00:00.000Z", metadata: { conflict_score: 0.8 } });
    const pack = await wiki.contextPack("원격근무", actorFromId("user:alice@example.com"));
    expect(pack.freshness_markers.some((marker) => marker.stale)).toBe(true);
    expect(pack.conflict_markers.some((marker) => marker.conflict_score === 0.8)).toBe(true);
    expect((await wiki.validate()).ok).toBe(true);
    await wiki.close();
  });

  it("CLI init, ingest, search, context-pack, backup, and mcp smoke work after build", () => {
    execFileSync("npm", ["run", "build"], { stdio: "pipe" });
    const file = join(root, "handbook.md");
    writeFileSync(file, "# 원격근무\n원격근무는 승인 후 가능하다.");
    const cli = join(process.cwd(), "dist", "cli", "awiki.js");
    const wikiRoot = join(root, "wiki");
    const init = JSON.parse(execFileSync("node", [cli, "init", "--root", wikiRoot, "--json"], { encoding: "utf8" }));
    expect(init.ok).toBe(true);
    const ingest = JSON.parse(execFileSync("node", [cli, "ingest", file, "--root", wikiRoot, "--owner", "team:ops", "--visibility", "internal", "--json"], { encoding: "utf8" }));
    expect(ingest.schema).toBe("atlas.wiki.source.v1");
    const search = JSON.parse(execFileSync("node", [cli, "search", "원격근무", "--root", wikiRoot, "--as", "user:alice@example.com", "--json"], { encoding: "utf8" }));
    expect(search.length).toBe(1);
    const pack = JSON.parse(execFileSync("node", [cli, "context-pack", "원격근무 정책", "--root", wikiRoot, "--as", "user:alice@example.com", "--json"], { encoding: "utf8" }));
    expect(pack.citations.length).toBe(1);
    const migration = JSON.parse(execFileSync("node", [cli, "migrate", "report", "--root", wikiRoot, "--json"], { encoding: "utf8" }));
    expect(migration.entries[0].status).toBe("applied");
    const audit = JSON.parse(execFileSync("node", [cli, "audit", "verify", "--root", wikiRoot, "--json"], { encoding: "utf8" }));
    expect(audit.ok).toBe(true);
    const backup = JSON.parse(execFileSync("node", [cli, "backup", "create", "--root", wikiRoot, "--json"], { encoding: "utf8" }));
    expect(backup.ok).toBe(true);
    expect(execFileSync("node", ["-e", `const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(${JSON.stringify(backup.path)}); console.log(Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records'").get())); db.close();`], { encoding: "utf8" })).toContain("true");
    const restoreRoot = join(root, "restored");
    const restored = JSON.parse(execFileSync("node", [cli, "backup", "restore", "--root", restoreRoot, "--in", backup.path, "--force", "--json"], { encoding: "utf8" }));
    expect(restored.ok).toBe(true);
    const restoredValidation = JSON.parse(execFileSync("node", [cli, "validate", "--root", restoreRoot, "--json"], { encoding: "utf8" }));
    expect(restoredValidation.ok).toBe(true);
    const mcp = JSON.parse(execFileSync("node", [cli, "mcp", "smoke", "--root", wikiRoot, "--stdio", "--json"], { encoding: "utf8" }));
    expect(mcp.tools).toContain("atlas_wiki.context_pack");
    expect(mcp.tools).not.toContain("atlas_wiki.ingest");
  });
});
