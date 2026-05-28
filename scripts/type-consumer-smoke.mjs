import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "atlas-wiki-types-"));
try {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module", dependencies: { "atlas-wiki": `file:${process.cwd()}` } }, null, 2));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", strict: true, skipLibCheck: true }, include: ["index.ts"] }, null, 2));
  writeFileSync(join(dir, "index.ts"), 'import { AtlasWiki, packageInfo } from "atlas-wiki";\nimport { listSupabaseMigrationAssets, writeSupabaseMigrations, type SupabaseMigrationAsset } from "atlas-wiki/supabase";\nconst name: string = packageInfo.name;\nconst open: typeof AtlasWiki.open = AtlasWiki.open;\nconst assets: SupabaseMigrationAsset[] = listSupabaseMigrationAssets();\nconst writer: typeof writeSupabaseMigrations = writeSupabaseMigrations;\nconsole.log(name, typeof open, assets.length, typeof writer);\n');
  execFileSync("npm", ["install", "--silent"], { cwd: dir, stdio: "pipe" });
  execFileSync(process.execPath, [join(process.cwd(), "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json", "--noEmit"], { cwd: dir, stdio: "pipe" });
  console.log("type consumer smoke ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
