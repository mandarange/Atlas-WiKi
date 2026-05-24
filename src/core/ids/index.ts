import { contentHash } from "../hash/index.js";
export function stableId(prefix: string, seed: unknown): string { return prefix + "_" + contentHash(seed).slice(0, 24); }
export function recordPrefix(kind: string): string { return kind.replace(/[^a-z0-9]+/gi, "_").toLowerCase(); }
