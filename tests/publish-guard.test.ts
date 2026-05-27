import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("stable publish guard", () => {
  it("blocks local stable publish without dry-run, trusted OIDC, or emergency override", () => {
    expect(() =>
      execFileSync("node", ["scripts/publish-guard.mjs"], {
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "", NODE_OPTIONS: "" },
        stdio: "pipe"
      })
    ).toThrow(/Stable npm publish is blocked/);
  });

  it("allows npm dry-run and trusted GitHub Actions OIDC contexts", () => {
    const dryRun = execFileSync("node", ["scripts/publish-guard.mjs"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", npm_config_dry_run: "true" }
    });
    expect(dryRun).toContain("publish guard ok");

    const trusted = execFileSync("node", ["scripts/publish-guard.mjs"], {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        GITHUB_ACTIONS: "true",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.githubusercontent.example",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "redacted"
      }
    });
    expect(trusted).toContain("publish guard ok");
  });
});
