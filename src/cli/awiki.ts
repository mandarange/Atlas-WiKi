#!/usr/bin/env node
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

export function nodeVersionSupported(version = process.versions.node): boolean {
  return Number(version.split(".")[0]) >= 24;
}

export function nodeVersionError(version = process.versions.node): Error {
  return new Error(`Atlas WiKi requires Node.js 24 or newer. Current Node.js version is ${version}. Install Node 24+ and retry the awiki command.`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (!nodeVersionSupported()) throw nodeVersionError();
  const mod = await import("./main.js");
  await mod.main(argv);
}

if (process.argv[1] && (import.meta.url === pathToFileURL(process.argv[1]).href || ["awiki", "atlas-wiki"].includes(basename(process.argv[1])))) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
