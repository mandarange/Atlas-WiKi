import { createHash } from "node:crypto";
export function canonicalize(value: unknown): string { return JSON.stringify(sortValue(value)); }
export function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
export function contentHash(value: unknown): string { return sha256(canonicalize(value)); }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = sortValue(item);
    }
    return out;
  }
  return value;
}
