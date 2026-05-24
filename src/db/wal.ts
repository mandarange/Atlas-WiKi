import type { DatabaseSync } from "node:sqlite";

export function checkpointWal(db: DatabaseSync): void {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
}
