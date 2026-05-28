import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "../../core/hash/index.js";
import { SupabaseStoreError } from "./errors.js";

export const SUPABASE_DEFAULT_VECTOR_DIMENSIONS = 1536;
export const SUPABASE_DEFAULT_DIMENSION_POLICY = "atlas_wiki_default_1536" as const;

export const SUPABASE_MIGRATION_FILENAMES = [
  "20260527000100_atlas_wiki_core.sql",
  "20260527000200_atlas_wiki_rls.sql",
  "20260527000300_atlas_wiki_audit.sql",
  "20260527000400_atlas_wiki_structured_records.sql",
  "20260527000500_atlas_wiki_vector_optional.sql",
  "20260527000600_atlas_wiki_search_rpc.sql",
  "20260527000700_atlas_wiki_rag_pgvector.sql",
  "20260527000800_atlas_wiki_n9_rpc_contracts.sql",
  "20260527000900_atlas_wiki_validation_contract.sql"
] as const;

export const SUPABASE_MIGRATION_VERSIONS = SUPABASE_MIGRATION_FILENAMES.map((filename) => filename.replace(/\.sql$/, ""));

export interface SupabaseMigrationAsset {
  filename: string;
  version: string;
  absolutePackagePath: string;
  sha256: string;
}

export interface SupabaseMigrationWriteOptions {
  overwrite?: boolean | undefined;
  dryRun?: boolean | undefined;
}

export interface SupabaseMigrationWriteResult {
  filename: string;
  version: string;
  source: string;
  destination: string;
  status: "copied" | "skipped" | "overwritten";
  sha256: string;
}

export interface SupabaseMigrationWriteReport {
  ok: boolean;
  outDir: string;
  dryRun: boolean;
  copied: string[];
  skipped: string[];
  overwritten: string[];
  migrations: SupabaseMigrationWriteResult[];
}

export interface SupabaseProjectScaffoldReport {
  ok: boolean;
  outDir: string;
  configPath: string;
  configStatus: "created" | "skipped" | "overwritten";
  migrationsDir: string;
  migrations: SupabaseMigrationWriteReport;
  nextSteps: string[];
}

export function listSupabaseMigrationAssets(): SupabaseMigrationAsset[] {
  assertNodeAssetRuntime();
  const dir = resolveSupabaseMigrationsDir();
  const present = new Set(readdirSync(dir).filter((filename) => filename.endsWith(".sql")));
  for (const filename of SUPABASE_MIGRATION_FILENAMES) {
    if (!present.has(filename)) throw new SupabaseStoreError(`Missing bundled Supabase migration asset: ${filename}`, { dir, filename });
  }
  return SUPABASE_MIGRATION_FILENAMES.map((filename) => {
    const absolutePackagePath = join(dir, filename);
    return {
      filename,
      version: filename.replace(/\.sql$/, ""),
      absolutePackagePath,
      sha256: sha256(readFileSync(absolutePackagePath))
    };
  });
}

export function writeSupabaseMigrations(outDir: string, options: SupabaseMigrationWriteOptions = {}): SupabaseMigrationWriteReport {
  assertNodeAssetRuntime();
  const targetDir = resolve(outDir);
  const assets = listSupabaseMigrationAssets();
  if (!options.dryRun) mkdirSync(targetDir, { recursive: true });
  const migrations = assets.map((asset): SupabaseMigrationWriteResult => {
    const destination = join(targetDir, asset.filename);
    const exists = existsSync(destination);
    const status = exists ? options.overwrite ? "overwritten" : "skipped" : "copied";
    if (!options.dryRun && status !== "skipped") copyFileSync(asset.absolutePackagePath, destination);
    return { filename: asset.filename, version: asset.version, source: asset.absolutePackagePath, destination, status, sha256: asset.sha256 };
  });
  return {
    ok: true,
    outDir: targetDir,
    dryRun: Boolean(options.dryRun),
    copied: migrations.filter((item) => item.status === "copied").map((item) => item.filename),
    skipped: migrations.filter((item) => item.status === "skipped").map((item) => item.filename),
    overwritten: migrations.filter((item) => item.status === "overwritten").map((item) => item.filename),
    migrations
  };
}

export function createSupabaseProjectScaffold(outDir: string, options: SupabaseMigrationWriteOptions = {}): SupabaseProjectScaffoldReport {
  assertNodeAssetRuntime();
  const targetDir = resolve(outDir);
  const migrationsDir = join(targetDir, "migrations");
  const configPath = join(targetDir, "config.toml");
  if (!options.dryRun) mkdirSync(targetDir, { recursive: true });
  const configExists = existsSync(configPath);
  const configStatus = configExists ? options.overwrite ? "overwritten" : "skipped" : "created";
  if (!options.dryRun && configStatus !== "skipped") writeFileSync(configPath, supabaseConfigToml());
  const migrations = writeSupabaseMigrations(migrationsDir, options);
  return {
    ok: true,
    outDir: targetDir,
    configPath,
    configStatus,
    migrationsDir,
    migrations,
    nextSteps: [
      "Run npx supabase link --project-ref <project-ref> from the project root.",
      "Run npx supabase db push after reviewing the exported SQL migrations.",
      "Run awiki supabase doctor --json with SUPABASE_URL and SUPABASE_ANON_KEY set."
    ]
  };
}

function resolveSupabaseMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, "../../..", "supabase", "migrations")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new SupabaseStoreError("Bundled Supabase migrations were not found in this package. Reinstall atlas-wiki or verify the npm tarball contents.", { candidates });
  return found;
}

function assertNodeAssetRuntime(): void {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new SupabaseStoreError("Supabase migration asset helpers require the Node.js fs runtime and are not supported in browser/client bundles.", {
      runtime: "browser_unsupported"
    });
  }
}

function supabaseConfigToml(): string {
  return [
    "# Minimal Atlas WiKi Supabase scaffold generated by awiki supabase init.",
    "# Link this directory to a hosted project with: npx supabase link --project-ref <project-ref>",
    'project_id = "atlas-wiki"',
    "",
    "[api]",
    "enabled = true",
    "",
    "[db]",
    'schema = "public"'
  ].join("\n") + "\n";
}
