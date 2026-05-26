import type { DatabaseSync } from "node:sqlite";

export interface WalCheckpointReport {
  busy: number;
  log: number;
  checkpointed: number;
}

export function checkpointWal(db: DatabaseSync): WalCheckpointReport {
  return db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as unknown as WalCheckpointReport;
}
