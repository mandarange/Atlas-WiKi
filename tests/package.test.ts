import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { packageInfo, schemas } from "../src/index.js";

describe("package surface", () => {
  it("matches package metadata and schemas", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; bin: Record<string, string>; exports: Record<string, unknown> };
    expect(pkg.name).toBe(packageInfo.name);
    expect(Object.keys(pkg.bin)).toEqual(["awiki", "atlas-wiki"]);
    expect(pkg.exports).toHaveProperty(".");
    expect(schemas.map((schema) => schema.$id)).toContain("atlas.wiki.source.v1");
  });
});
