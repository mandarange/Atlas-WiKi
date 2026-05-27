#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const args = parseArgs(process.argv.slice(2));
const outputPath = args.get("output") || `release-evidence/rag-eval-v${JSON.parse(readFileSync("package.json", "utf8")).version}.json`;
const fixturePath = args.get("fixture");
const mod = await import(pathToFileURL(`${process.cwd()}/dist/index.js`).href);
const dataset = fixturePath ? JSON.parse(readFileSync(fixturePath, "utf8")) : mod.defaultRagEvalDataset;
const report = args.get("score-observed") ? mod.runRagEvalDataset(dataset) : await mod.runLiveRagEvalDataset(dataset);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify({ ...report, outputPath }, null, 2) + "\n");
console.log(JSON.stringify({ ...report, outputPath }, null, 2));
if (!report.passed) process.exitCode = 1;

function parseArgs(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      flags.set(key, value);
      i += 1;
    } else {
      flags.set(key, "1");
    }
  }
  return flags;
}
