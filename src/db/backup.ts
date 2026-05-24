import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

export async function createSqliteBackup(db: DatabaseSync, dbPath: string, outDir: string, stamp = new Date().toISOString().replace(/[:.]/g, "-")): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${basename(dbPath)}.${stamp}.bak`);
  await backup(db, out);
  return out;
}

export function verifySqliteBackup(path: string): boolean {
  if (!existsSync(path)) return false;
  const db = new DatabaseSync(path);
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
    const records = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'records'").get();
    return integrity?.integrity_check === "ok" && Boolean(records);
  } finally {
    db.close();
  }
}
