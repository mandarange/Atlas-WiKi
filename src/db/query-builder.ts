export interface FtsQueryBuildResult {
  query: string | null;
  fallbackReason: string | null;
}

const tokenPattern = /[\p{L}\p{N}_-]+/gu;

export function buildSafeFtsQuery(input: string, maxTokens = 12): FtsQueryBuildResult {
  const raw = input.trim();
  if (!raw) return { query: null, fallbackReason: "empty_query" };
  const tokens = raw.match(tokenPattern)?.slice(0, maxTokens) ?? [];
  if (tokens.length === 0) return { query: null, fallbackReason: "no_safe_tokens" };
  const query = tokens.map((token) => `"${token.replace(/"/g, "\"\"")}"`).join(" ");
  const fallbackReason = tokens.join(" ") === raw ? null : "unsafe_fts_syntax_sanitized";
  return { query, fallbackReason };
}
