import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkDatabaseIntegrity } from "../src/db/integrity.js";
import { applyMigrationSet, applyMigrations, migrationDryRun } from "../src/db/migrations.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-wiki-mig-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function db(name = "atlas-wiki.sqlite"): DatabaseSync {
  return new DatabaseSync(join(root, name));
}

describe("migration hardening", () => {
  it("stores metadata, aligns user_version, and reports dry-run status", () => {
    const handle = db();
    try {
      const report = applyMigrations(handle, { clock: { nowIso: () => "2026-05-26T00:00:00.000Z" }, packageVersion: "test", nodeVersion: "v24.test" });
      expect(report.ok).toBe(true);
      expect(report.user_version).toBe(2);
      const row = handle.prepare("SELECT checksum, package_version, node_version, ordinal FROM migrations WHERE id = '0001_initial'").get() as { checksum: string; package_version: string; node_version: string; ordinal: number };
      expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(row.package_version).toBe("test");
      expect(row.node_version).toBe("v24.test");
      expect(row.ordinal).toBe(1);
      const auditHead = handle.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audit_head'").get();
      expect(auditHead).toBeTruthy();
      expect(migrationDryRun(handle).entries[0]?.status).toBe("applied");
      expect(checkDatabaseIntegrity(handle)).toEqual({ ok: true, findings: [] });
    } finally {
      handle.close();
    }
  });

  it("never re-executes an already applied legacy row before backfilling metadata", () => {
    const handle = db();
    try {
      handle.exec("CREATE TABLE migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");
      handle.exec("CREATE TABLE audit_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, actor_json TEXT NOT NULL, request_id TEXT NOT NULL, record_refs_json TEXT NOT NULL, policy_decisions_json TEXT NOT NULL, outcome TEXT NOT NULL, created_at TEXT NOT NULL, hash_prev TEXT, hash_self TEXT NOT NULL);");
      handle.prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)").run("0001_initial", "2026-05-25T00:00:00.000Z");
      const report = applyMigrations(handle);
      expect(report.entries[0]?.status).toBe("legacy_metadata_backfill");
      expect(report.entries[1]?.status).toBe("applied");
      const tables = handle.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'records'").get();
      expect(tables).toBeUndefined();
      const row = handle.prepare("SELECT checksum FROM migrations WHERE id = '0001_initial'").get() as { checksum: string };
      expect(row.checksum).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      handle.close();
    }
  });

  it("fails hard on changed checksums and rolls back failed migration sets", () => {
    const handle = db();
    try {
      applyMigrations(handle);
      handle.prepare("UPDATE migrations SET checksum = 'bad' WHERE id = '0001_initial'").run();
      expect(() => applyMigrations(handle)).toThrow(/checksum/i);

      const failing = db("failing.sqlite");
      expect(() => applyMigrationSet(failing, [
        { id: "0001_ok", sql: "CREATE TABLE ok_table (id TEXT PRIMARY KEY);" },
        { id: "0002_bad", sql: "CREATE TABLE broken (" }
      ])).toThrow();
      expect(failing.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ok_table'").get()).toBeUndefined();
      failing.close();
    } finally {
      handle.close();
    }
  });

  it("detects missing and out-of-order migration rows", () => {
    const missing = db("missing.sqlite");
    try {
      missing.exec("CREATE TABLE migrations (id TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT NOT NULL, package_version TEXT, node_version TEXT, ordinal INTEGER);");
      missing.prepare("INSERT INTO migrations (id, checksum, applied_at, ordinal) VALUES (?, ?, ?, ?)").run("9999_unknown", "abc", "2026-05-26T00:00:00.000Z", 99);
      expect(() => applyMigrationSet(missing, [{ id: "0001_known", sql: "CREATE TABLE known (id TEXT PRIMARY KEY);" }])).toThrow(/missing/i);
    } finally {
      missing.close();
    }

    const outOfOrder = db("out-of-order.sqlite");
    try {
      outOfOrder.exec("CREATE TABLE migrations (id TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT NOT NULL, package_version TEXT, node_version TEXT, ordinal INTEGER);");
      outOfOrder.prepare("INSERT INTO migrations (id, checksum, applied_at, ordinal) VALUES (?, ?, ?, ?)").run("0002_later", "abc", "2026-05-26T00:00:00.000Z", 2);
      expect(() => applyMigrationSet(outOfOrder, [
        { id: "0001_first", sql: "CREATE TABLE first_table (id TEXT PRIMARY KEY);" },
        { id: "0002_later", sql: "CREATE TABLE later_table (id TEXT PRIMARY KEY);" }
      ])).toThrow(/order/i);
    } finally {
      outOfOrder.close();
    }
  });
});
