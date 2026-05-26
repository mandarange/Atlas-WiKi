import type { DatabaseSync } from "node:sqlite";
import { packageInfo } from "../package-info.js";
import { MigrationChecksumError, MigrationOrderError, MissingMigrationError } from "../core/errors/index.js";
import { sha256 } from "../core/hash/index.js";
import { schemaSql } from "./schema.js";

export interface Migration {
  id: string;
  sql: string;
}

export interface MigrationOptions {
  clock?: { nowIso(): string } | undefined;
  packageVersion?: string | undefined;
  nodeVersion?: string | undefined;
  allowLegacyMetadataBackfill?: boolean | undefined;
}

export interface MigrationRow {
  id: string;
  checksum: string | null;
  applied_at: string;
  package_version: string | null;
  node_version: string | null;
  ordinal: number | null;
}

export interface MigrationPlanEntry {
  id: string;
  checksum: string;
  status: "pending" | "applied" | "legacy_metadata_backfill";
  applied_at?: string | undefined;
}

export interface MigrationReport {
  ok: boolean;
  user_version: number;
  applied_count: number;
  pending_count: number;
  entries: MigrationPlanEntry[];
}

export const migrations: readonly Migration[] = [{ id: "0001_initial", sql: schemaSql }];

export function applyMigrations(db: DatabaseSync, options: MigrationOptions = {}): MigrationReport {
  return applyMigrationSet(db, migrations, options);
}

export function applyMigrationSet(db: DatabaseSync, migrationSet: readonly Migration[], options: MigrationOptions = {}): MigrationReport {
  db.exec("PRAGMA foreign_keys = ON;");
  ensureMigrationsTable(db);
  const nowIso = options.clock?.nowIso ?? (() => new Date().toISOString());
  const packageVersion = options.packageVersion ?? packageInfo.version;
  const nodeVersion = options.nodeVersion ?? process.version;
  const registryIds = new Set(migrationSet.map((migration) => migration.id));
  for (const row of getMigrationRows(db)) {
    if (!registryIds.has(row.id)) throw new MissingMigrationError(row.id);
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const entries: MigrationPlanEntry[] = [];
    for (let index = 0; index < migrationSet.length; index += 1) {
      const migration = migrationSet[index]!;
      const checksum = sha256(migration.sql);
      const existing = getMigrationRow(db, migration.id);
      if (existing) {
        if (existing.checksum && existing.checksum !== checksum) throw new MigrationChecksumError(migration.id, existing.checksum, checksum);
        if (!existing.checksum) {
          if (options.allowLegacyMetadataBackfill === false) throw new MigrationChecksumError(migration.id, "<legacy-missing-checksum>", checksum);
          updateLegacyMigrationRow(db, migration.id, checksum, packageVersion, nodeVersion, index + 1);
          entries.push({ id: migration.id, checksum, status: "legacy_metadata_backfill", applied_at: existing.applied_at });
        } else {
          entries.push({ id: migration.id, checksum, status: "applied", applied_at: existing.applied_at });
        }
        continue;
      }

      assertNoLaterMigrationApplied(db, migrationSet, index);
      const appliedAt = nowIso();
      db.exec(migration.sql);
      insertMigrationRow(db, {
        id: migration.id,
        checksum,
        applied_at: appliedAt,
        package_version: packageVersion,
        node_version: nodeVersion,
        ordinal: index + 1
      });
      entries.push({ id: migration.id, checksum, status: "applied", applied_at: appliedAt });
    }
    alignUserVersion(db, migrationSet.length);
    db.exec("COMMIT");
    return buildMigrationReport(db, entries);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function migrationDryRun(db: DatabaseSync): MigrationReport {
  ensureMigrationsTable(db);
  const rows = new Map(getMigrationRows(db).map((row) => [row.id, row]));
  const entries = migrations.map((migration) => {
    const row = rows.get(migration.id);
    const checksum = sha256(migration.sql);
    if (!row) return { id: migration.id, checksum, status: "pending" as const };
    if (row.checksum && row.checksum !== checksum) throw new MigrationChecksumError(migration.id, row.checksum, checksum);
    return {
      id: migration.id,
      checksum,
      status: row.checksum ? "applied" as const : "legacy_metadata_backfill" as const,
      applied_at: row.applied_at
    };
  });
  return buildMigrationReport(db, entries);
}

export function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT,
      applied_at TEXT NOT NULL,
      package_version TEXT,
      node_version TEXT,
      ordinal INTEGER
    );
  `);
  const columns = new Set((db.prepare("PRAGMA table_info(migrations)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("checksum")) db.exec("ALTER TABLE migrations ADD COLUMN checksum TEXT;");
  if (!columns.has("package_version")) db.exec("ALTER TABLE migrations ADD COLUMN package_version TEXT;");
  if (!columns.has("node_version")) db.exec("ALTER TABLE migrations ADD COLUMN node_version TEXT;");
  if (!columns.has("ordinal")) db.exec("ALTER TABLE migrations ADD COLUMN ordinal INTEGER;");
}

function getMigrationRow(db: DatabaseSync, id: string): MigrationRow | undefined {
  return db.prepare("SELECT id, checksum, applied_at, package_version, node_version, ordinal FROM migrations WHERE id = ?").get(id) as MigrationRow | undefined;
}

function getMigrationRows(db: DatabaseSync): MigrationRow[] {
  return db.prepare("SELECT id, checksum, applied_at, package_version, node_version, ordinal FROM migrations ORDER BY COALESCE(ordinal, rowid)").all() as unknown as MigrationRow[];
}

function insertMigrationRow(db: DatabaseSync, row: Required<MigrationRow>): void {
  db.prepare("INSERT INTO migrations (id, checksum, applied_at, package_version, node_version, ordinal) VALUES (?, ?, ?, ?, ?, ?)").run(
    row.id,
    row.checksum,
    row.applied_at,
    row.package_version,
    row.node_version,
    row.ordinal
  );
}

function updateLegacyMigrationRow(db: DatabaseSync, id: string, checksum: string, packageVersion: string, nodeVersion: string, ordinal: number): void {
  db.prepare("UPDATE migrations SET checksum = ?, package_version = COALESCE(package_version, ?), node_version = COALESCE(node_version, ?), ordinal = COALESCE(ordinal, ?) WHERE id = ?").run(
    checksum,
    packageVersion,
    nodeVersion,
    ordinal,
    id
  );
}

function assertNoLaterMigrationApplied(db: DatabaseSync, registry: readonly Migration[], index: number): void {
  const laterIds = new Set(registry.slice(index + 1).map((migration) => migration.id));
  const later = getMigrationRows(db).find((row) => laterIds.has(row.id));
  if (later) throw new MigrationOrderError(registry[index]!.id, { later_applied: later.id });
}

function alignUserVersion(db: DatabaseSync, version: number): void {
  db.exec(`PRAGMA user_version = ${version};`);
}

function buildMigrationReport(db: DatabaseSync, entries: MigrationPlanEntry[]): MigrationReport {
  const userVersion = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  const pending = entries.filter((entry) => entry.status === "pending").length;
  return {
    ok: true,
    user_version: userVersion?.user_version ?? 0,
    applied_count: entries.length - pending,
    pending_count: pending,
    entries
  };
}
