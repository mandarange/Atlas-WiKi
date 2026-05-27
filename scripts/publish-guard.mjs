const isDryRun = process.env.npm_config_dry_run === "true";
const isTrustedGithubAction =
  process.env.GITHUB_ACTIONS === "true" &&
  Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL) &&
  Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
const isEmergency = process.env.ATLAS_WIKI_EMERGENCY_LOCAL_PUBLISH === "true";

if (isDryRun || isTrustedGithubAction || isEmergency) {
  console.log("publish guard ok");
  process.exit(0);
}

console.error("Stable npm publish is blocked outside trusted GitHub Actions OIDC. Set ATLAS_WIKI_EMERGENCY_LOCAL_PUBLISH=true only for an auditable emergency.");
process.exit(1);
