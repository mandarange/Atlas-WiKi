import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const deployRoot = join(process.cwd(), "deploy");
const artifacts = [
  "Dockerfile",
  "compose.yaml",
  "kubernetes.yaml",
  "desktop-app-placeholder.md",
  "server-config.example.json",
  "oauth.example.json",
  "backup-cron.example",
  "disaster-recovery.md"
] as const;

describe("deployment artifacts", () => {
  it.each(artifacts)("%s exists", (file) => {
    expect(existsSync(join(deployRoot, file))).toBe(true);
  });

  it("runs the package CLI through the container entrypoint", () => {
    const dockerfile = readFileSync(join(deployRoot, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("node:24");
    expect(dockerfile).toContain("dist/cli/awiki.js");
    expect(dockerfile).toContain("ATLAS_WIKI_ROOT");
  });

  it("keeps credentials outside checked-in OAuth config", () => {
    const oauth = JSON.parse(readFileSync(join(deployRoot, "oauth.example.json"), "utf8")) as { providers: unknown[]; notes: string };
    expect(oauth.providers).toEqual([]);
    expect(oauth.notes).toMatch(/secrets stay outside/i);
  });

  it("documents backup verification and restore validation", () => {
    const dr = readFileSync(join(deployRoot, "disaster-recovery.md"), "utf8");
    expect(dr).toContain("awiki backup verify");
    expect(dr).toContain("awiki validate");
    expect(dr).toContain("awiki rebuild-index");
  });
});
