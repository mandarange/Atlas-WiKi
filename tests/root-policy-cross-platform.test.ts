import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReadonlyAtlasWikiServer } from "../src/index.js";

let root: string;

beforeEach(() => {
  root = join(tmpdir(), `atlas-wiki-root-policy-${process.pid}-${Date.now()}`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("cross-platform MCP root policy", () => {
  it("rejects symlink traversal outside allowed roots", async () => {
    const allowed = join(root, "allowed");
    const outside = join(root, "outside");
    const link = join(allowed, "escape");
    mkdirSync(allowed, { recursive: true });
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, link);

    const server = createReadonlyAtlasWikiServer({ mode: "development", allowedRoots: [allowed] });
    await expect(handler(server, "atlas_wiki.validate")({ root: link })).rejects.toThrow(/outside allowed roots/);
  });

  it("rejects absolute root paths outside the configured root on every platform", async () => {
    const allowed = resolve(root, "allowed");
    const outside = resolve(parse(allowed).root, "atlas-wiki-outside-root-policy");
    mkdirSync(allowed, { recursive: true });
    const server = createReadonlyAtlasWikiServer({ mode: "development", allowedRoots: [allowed] });
    await expect(handler(server, "atlas_wiki.validate")({ root: outside })).rejects.toThrow(/outside allowed roots/);
  });
});

function handler(server: unknown, name: string): (input: Record<string, unknown>) => Promise<unknown> {
  return (server as { _registeredTools: Record<string, { handler: (input: Record<string, unknown>) => Promise<unknown> }> })._registeredTools[name]!.handler;
}
