import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface DatabaseHandle {
  path: string;
  db: DatabaseSync;
}

export interface OpenDatabaseOptions {
  busyTimeoutMs?: number | undefined;
}

export function openDatabase(path: string, options: OpenDatabaseOptions = {}): DatabaseHandle {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(options.busyTimeoutMs ?? 5000))}; PRAGMA foreign_keys = ON;`);
  const journal = db.prepare("PRAGMA journal_mode = WAL").get() as { journal_mode?: string } | undefined;
  if (journal?.journal_mode?.toLowerCase() !== "wal") throw new Error("Failed to enable SQLite WAL mode");
  return { path, db };
}
