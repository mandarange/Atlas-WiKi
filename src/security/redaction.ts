import type { RedactionEvent, RecordRef } from "../core/records/index.js";
const patterns: Array<{ name: string; regex: RegExp }> = [
  { name: "secret_assignment", regex: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*[^\s,;]+/gi },
  { name: "authorization_bearer", regex: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi },
  { name: "openai_key", regex: /\bsk-[A-Za-z0-9_-]{8,}\b/g },
  { name: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "github_token", regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { name: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { name: "credit_card", regex: /\b(?:\d[ -]*?){13,19}\b/g }
];
export interface RedactionResult { text: string; events: RedactionEvent[]; }
export interface RedactionOptions {
  field?: string | undefined;
  sensitivity?: "public" | "internal" | "confidential" | "restricted" | "secret" | undefined;
  protectedFields?: readonly string[] | undefined;
}

export function redactText(text: string, record_ref: RecordRef, fieldOrOptions: string | RedactionOptions = "text"): RedactionResult {
  const options = typeof fieldOrOptions === "string" ? { field: fieldOrOptions } : fieldOrOptions;
  const field = options.field ?? "text";
  if (options.sensitivity === "secret" || options.protectedFields?.includes(field)) {
    return { text: "[REDACTED]", events: [{ record_ref, field, reason: options.sensitivity === "secret" ? "secret_sensitivity_policy" : "protected_field_policy" }] };
  }
  let redacted = text; const events: RedactionEvent[] = [];
  for (const pattern of patterns) { pattern.regex.lastIndex = 0; if (pattern.regex.test(redacted)) { pattern.regex.lastIndex = 0; redacted = redacted.replace(pattern.regex, "[REDACTED]"); events.push({ record_ref, field, reason: pattern.name }); } }
  return { text: redacted, events };
}
export function containsSecretLikeText(text: string): boolean { return patterns.some((pattern) => { pattern.regex.lastIndex = 0; return pattern.regex.test(text); }); }
