import { execFileSync } from "node:child_process";

const mock = process.argv.includes("--mock");
const commands = mock
  ? [["npm", ["run", "typecheck"]], ["npm", ["run", "build"]], ["npm", ["run", "test"]]]
  : [["npm", ["run", "release:check"]]];

for (const [command, args] of commands) {
  execFileSync(command, args, { stdio: "inherit" });
}

console.log(JSON.stringify({ ok: true, mock }));
