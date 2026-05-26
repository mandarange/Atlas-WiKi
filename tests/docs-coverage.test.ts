import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const docsRoot = join(process.cwd(), "docs");
const requiredDocs = [
  "architecture.md",
  "sqlite-storage.md",
  "security-model.md",
  "acl-model.md",
  "schema.md",
  "ingestion.md",
  "retrieval.md",
  "mcp.md",
  "mcp-security.md",
  "sdk.md",
  "cli.md",
  "connectors.md",
  "audit-model.md",
  "audit-chain.md",
  "backup-restore.md",
  "migration-policy.md",
  "production-hardening.md",
  "production-hardening-completion.md",
  "deployment.md",
  "adapter-boundary.md",
  "migration-from-sks.md"
] as const;

describe("documentation coverage", () => {
  it.each(requiredDocs)("%s has artifact, core link, security, verification, and operator guidance", (file) => {
    const path = join(docsRoot, file);
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toMatch(/^# /);
    expect(text).toMatch(/Core Link/i);
    expect(text).toMatch(/Security/i);
    expect(text).toMatch(/Verification/i);
    expect(text).toMatch(/Operator Notes/i);
  });

  it("keeps a manifest for the full documentation release gate", () => {
    const manifest = readFileSync(join(docsRoot, "docs-manifest.md"), "utf8");
    for (const file of requiredDocs) {
      const normalized = file.replace(".md", "").replaceAll("-", " ");
      expect(manifest.toLowerCase()).toContain(normalized.split(" ")[0]);
    }
  });
});
