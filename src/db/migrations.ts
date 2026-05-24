import type { DatabaseSync } from "node:sqlite";
import { schemaSql } from "./schema.js";

export const migrations = [{ id: "0001_initial", sql: schemaSql }] as const;

export function applyMigrations(db: DatabaseSync): void {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");
  const insert = db.prepare("INSERT OR IGNORE INTO migrations (id, applied_at) VALUES (?, ?)");
  for (const migration of migrations) {
    db.exec(migration.sql);
    insert.run(migration.id, new Date().toISOString());
  }
}
