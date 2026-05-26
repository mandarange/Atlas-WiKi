import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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

export function restoreSqliteBackup(input: { backupPath: string; dbPath: string; overwrite?: boolean | undefined }): string {
  if (!verifySqliteBackup(input.backupPath)) throw new Error("Backup verification failed before restore: " + input.backupPath);
  if (existsSync(input.dbPath) && !input.overwrite) throw new Error("Refusing to overwrite existing database without --force: " + input.dbPath);
  mkdirSync(dirname(input.dbPath), { recursive: true });
  copyFileSync(input.backupPath, input.dbPath);
  if (!verifySqliteBackup(input.dbPath)) throw new Error("Restored database failed verification: " + input.dbPath);
  return input.dbPath;
}
