import type { DatabaseSync } from "node:sqlite";
import { DatabaseIntegrityError } from "../core/errors/index.js";

export interface IntegrityReport {
  ok: boolean;
  findings: string[];
}

export function checkDatabaseIntegrity(db: DatabaseSync): IntegrityReport {
  const findings: string[] = [];
  const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
  if (integrity?.integrity_check !== "ok") findings.push("integrity_check_failed:" + (integrity?.integrity_check ?? "missing"));

  const foreignKeyRows = db.prepare("PRAGMA foreign_key_check").all() as Array<Record<string, unknown>>;
  for (const row of foreignKeyRows) findings.push("foreign_key_check_failed:" + JSON.stringify(row));

  return { ok: findings.length === 0, findings };
}

export function assertDatabaseIntegrity(db: DatabaseSync): void {
  const report = checkDatabaseIntegrity(db);
  if (!report.ok) throw new DatabaseIntegrityError(report.findings);
}
