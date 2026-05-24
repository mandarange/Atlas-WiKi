import { chmodSync, existsSync } from "node:fs";

const bin = "dist/cli/awiki.js";
if (existsSync(bin)) chmodSync(bin, 0o755);
