import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSupabaseProjectScaffold,
  listSupabaseMigrationAssets,
  SUPABASE_DEFAULT_DIMENSION_POLICY,
  SUPABASE_DEFAULT_VECTOR_DIMENSIONS,
  SUPABASE_MIGRATION_FILENAMES,
  writeSupabaseMigrations
} from "../src/store/supabase/index.js";

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "atlas-wiki-supabase-assets-"));
  roots.push(path);
  return path;
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("Supabase package assets", () => {
  it("lists migration metadata with package paths and checksums", () => {
    const assets = listSupabaseMigrationAssets();
    expect(assets.map((asset) => asset.filename)).toEqual([...SUPABASE_MIGRATION_FILENAMES]);
    expect(assets[0]).toMatchObject({ filename: "20260527000100_atlas_wiki_core.sql", version: "20260527000100_atlas_wiki_core" });
    expect(assets.every((asset) => existsSync(asset.absolutePackagePath) && /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true);
  });

  it("exports migrations without overwriting by default and reports overwrite explicitly", () => {
    const outDir = join(root(), "migrations");
    const first = writeSupabaseMigrations(outDir);
    expect(first.copied).toHaveLength(SUPABASE_MIGRATION_FILENAMES.length);
    const target = join(outDir, SUPABASE_MIGRATION_FILENAMES[0]!);
    writeFileSync(target, "-- local edit\n");

    const skipped = writeSupabaseMigrations(outDir);
    expect(skipped.skipped).toContain(SUPABASE_MIGRATION_FILENAMES[0]);
    expect(readFileSync(target, "utf8")).toBe("-- local edit\n");

    const overwritten = writeSupabaseMigrations(outDir, { overwrite: true });
    expect(overwritten.overwritten).toContain(SUPABASE_MIGRATION_FILENAMES[0]);
    expect(readFileSync(target, "utf8")).not.toBe("-- local edit\n");
  });

  it("creates an npm-only Supabase scaffold with config and migrations", () => {
    const outDir = join(root(), "supabase");
    const report = createSupabaseProjectScaffold(outDir);
    expect(report.configStatus).toBe("created");
    expect(existsSync(join(outDir, "config.toml"))).toBe(true);
    expect(report.migrations.copied).toHaveLength(SUPABASE_MIGRATION_FILENAMES.length);
    expect(report.nextSteps.join("\n")).toContain("npx supabase db push");
  });

  it("documents the bundled 1536-dimension Supabase policy", () => {
    expect(SUPABASE_DEFAULT_DIMENSION_POLICY).toBe("atlas_wiki_default_1536");
    expect(SUPABASE_DEFAULT_VECTOR_DIMENSIONS).toBe(1536);
  });
});
