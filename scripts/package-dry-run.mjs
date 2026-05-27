import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

try {
  execFileSync("npm", ["publish", "--dry-run"], { encoding: "utf8", stdio: "pipe" });
  console.log("package dry-run ok");
} catch (error) {
  const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
  const alreadyPublished = output.includes("previously published versions") || output.includes("EPUBLISHCONFLICT");
  if (!alreadyPublished) {
    process.stderr.write(output);
    process.exit(error.status ?? 1);
  }
  const registryVersion = execFileSync("npm", ["view", pkg.name, "version"], { encoding: "utf8" }).trim();
  if (registryVersion !== pkg.version) {
    process.stderr.write(output);
    process.exit(error.status ?? 1);
  }
  console.log(`package dry-run accepted: ${pkg.name}@${pkg.version} is the already-published reproducibility baseline`);
}
