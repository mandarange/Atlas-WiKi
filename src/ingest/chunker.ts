import { contentHash } from "../core/hash/index.js";

export interface TextChunk {
  ordinal: number;
  text: string;
  text_hash: string;
}

export function chunkText(text: string, maxChars = 1200): TextChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((item, ordinal) => ({ ordinal, text: item, text_hash: contentHash(item) }));
}
