import { contentHash } from "../../core/hash/index.js";

export function vectorHash(vector: readonly number[]): string {
  return contentHash({ vector });
}

export function assertVectorDimensions(vector: readonly number[], dimensions: number): void {
  if (vector.length !== dimensions) throw new Error(`Expected vector dimensions ${dimensions}, received ${vector.length}`);
}
