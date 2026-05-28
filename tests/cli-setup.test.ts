import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { main, nodeVersionError, nodeVersionSupported } from "../src/cli/awiki.js";
import { runInteractiveSetup } from "../src/cli/setup.js";

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "atlas-wiki-cli-setup-"));
  roots.push(path);
  return path;
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("CLI setup", () => {
  it("checks Node 24 before loading the SQLite-backed CLI implementation", () => {
    expect(nodeVersionSupported("24.0.0")).toBe(true);
    expect(nodeVersionSupported("23.11.0")).toBe(false);
    expect(nodeVersionError("22.0.0").message).toContain("Node.js 24 or newer");
  });

  it("accepts interactive setup answers from a CLI input stream", async () => {
    const dataRoot = root();
    const silentOutput = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const input = new PassThrough();
    setTimeout(() => input.write("testing\n"), 0);
    setTimeout(() => input.write("degrade\n"), 5);
    setTimeout(() => input.end("n\n"), 10);
    const result = await runInteractiveSetup({
      root: dataRoot,
      flags: new Map(),
      input,
      output: silentOutput
    });

    expect(result.ok).toBe(true);
    expect(result.config.rag).toMatchObject({ enabled: true, provider: "testing", fallbackPolicy: "degrade" });
    expect(JSON.parse(readFileSync(join(dataRoot, "cli-config.json"), "utf8")).rag.provider).toBe("testing");
  });

  it("writes non-interactive Gemini and Supabase setup without storing secrets", async () => {
    const dataRoot = root();
    const output = await captureStdout(() =>
      main([
        "setup",
        "--root",
        dataRoot,
        "--non-interactive",
        "--provider",
        "gemini",
        "--model",
        "gemini-embedding-2",
        "--dimensions",
        "768",
        "--api-key-env",
        "ATLAS_GEMINI_KEY",
        "--supabase",
        "--write-env-example",
        "--json"
      ])
    );

    const result = JSON.parse(output);
    const configPath = join(dataRoot, "cli-config.json");
    const envPath = join(dataRoot, ".env.example");
    const config = JSON.parse(readFileSync(configPath, "utf8"));

    expect(result.ok).toBe(true);
    expect(config.rag).toMatchObject({ enabled: true, provider: "gemini", model: "gemini-embedding-2", dimensions: 768, apiKeyEnv: "ATLAS_GEMINI_KEY" });
    expect(config).not.toHaveProperty("apiKey");
    expect(config.supabase).toMatchObject({ enabled: true, schema: "atlas_wiki" });
    expect(existsSync(envPath)).toBe(true);
    expect(readFileSync(envPath, "utf8")).toContain("ATLAS_GEMINI_KEY=");
  });

  it("persists rag enable settings and reuses them for status", async () => {
    const dataRoot = root();
    await captureStdout(() =>
      main([
        "rag",
        "enable",
        "--root",
        dataRoot,
        "--provider",
        "testing",
        "--fallback",
        "testing_deterministic_embeddings",
        "--dimensions",
        "16",
        "--json"
      ])
    );

    const status = JSON.parse(await captureStdout(() => main(["rag", "status", "--root", dataRoot, "--json"])));

    expect(status.config).toMatchObject({ enabled: true, provider: "testing", dimensions: 16 });
    expect(status.embedding_provider).toBe("testing_deterministic");
    expect(status.config_path).toBe(join(dataRoot, "cli-config.json"));
  });

  it("fails vector-only Gemini commands with the configured env var name", async () => {
    const dataRoot = root();
    await captureStdout(() =>
      main(["setup", "--root", dataRoot, "--non-interactive", "--provider", "gemini", "--api-key-env", "ATLAS_GEMINI_KEY", "--json"])
    );

    await expect(main(["rag", "search", "policy", "--root", dataRoot, "--mode", "vector", "--json"])).rejects.toThrow(
      "ATLAS_GEMINI_KEY is required for Gemini RAG"
    );
  });

  it("exports Supabase migrations through npm-only CLI commands", async () => {
    const out = join(root(), "supabase");
    const init = JSON.parse(await captureStdout(() => main(["supabase", "init", "--out", out, "--json"])));
    expect(init.ok).toBe(true);
    expect(init.configStatus).toBe("created");
    expect(init.migrations.copied).toHaveLength(9);
    expect(existsSync(join(out, "migrations", "20260527000900_atlas_wiki_validation_contract.sql"))).toBe(true);

    const dryRunOut = join(root(), "dry-run-supabase");
    const dryRun = JSON.parse(await captureStdout(() => main(["supabase", "init", "--out", dryRunOut, "--dry-run", "--json"])));
    expect(dryRun.ok).toBe(true);
    expect(dryRun.migrations.dryRun).toBe(true);
    expect(existsSync(dryRunOut)).toBe(false);

    const exportOut = join(root(), "exported-migrations");
    const exported = JSON.parse(await captureStdout(() => main(["supabase", "migrations", "export", "--out", exportOut, "--json"])));
    expect(exported.copied).toHaveLength(9);
    expect(existsSync(join(exportOut, "20260527000100_atlas_wiki_core.sql"))).toBe(true);

    const list = JSON.parse(await captureStdout(() => main(["supabase", "migrations", "list", "--json"])));
    expect(list.count).toBe(9);
    expect(list.migrations[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    const status = JSON.parse(await captureStdout(() => main(["supabase", "status", "--json"])));
    expect(status.packageAssets.dimensionPolicy).toBe("atlas_wiki_default_1536");
  });

  it("keeps Supabase CLI errors user-facing for missing env and custom dimensions", async () => {
    const doctor = JSON.parse(await captureStdout(() => main(["supabase", "doctor", "--url", "", "--key", "", "--json"])));
    expect(doctor.ok).toBe(false);
    expect(doctor.findings.join("\n")).toContain("missing_supabase_url");
    const serviceRoleDoctor = JSON.parse(await captureStdout(() => main(["supabase", "doctor", "--service-role", "--url", "", "--key", "", "--json"])));
    expect(serviceRoleDoctor.warning).toContain("server-only secrets");
    await expect(main(["supabase", "init", "--dimensions", "768", "--json"])).rejects.toThrow(/1536/);
  });
});
