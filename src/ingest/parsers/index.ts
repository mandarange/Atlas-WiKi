import { readFileSync } from "node:fs";
import { extname } from "node:path";

export interface ParsedDocument {
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}

export function parseFile(path: string): ParsedDocument {
  const ext = extname(path).toLowerCase();
  const raw = readFileSync(path, "utf8");
  if (ext === ".json") {
    return { title: path, text: JSON.stringify(JSON.parse(raw), null, 2), metadata: { parser: "json" } };
  }
  if (ext === ".jsonl" || ext === ".ndjson") {
    const rows = raw.split(/\n/).filter(Boolean).map((line) => JSON.parse(line) as unknown);
    return { title: path, text: rows.map((row) => JSON.stringify(row)).join("\n"), metadata: { parser: "jsonl", rows: rows.length } };
  }
  if (ext === ".csv") return { title: path, text: raw, metadata: { parser: "csv" } };
  if (ext === ".md" || ext === ".markdown") {
    return { title: path, text: raw.replace(/^---[\s\S]*?---\n/, ""), metadata: { parser: "markdown" } };
  }
  return { title: path, text: raw, metadata: { parser: "text" } };
}
