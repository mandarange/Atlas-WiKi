const isDryRun = process.env.npm_config_dry_run === "true";
const isTrustedGithubAction =
  process.env.GITHUB_ACTIONS === "true" &&
  Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL) &&
  Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
const isEmergency = process.env.ATLAS_WIKI_EMERGENCY_LOCAL_PUBLISH === "true";

const mode = isDryRun
  ? "dry-run"
  : isTrustedGithubAction
    ? "trusted-github-actions-oidc"
    : isEmergency
      ? "emergency-local"
      : "local";

console.log(`publish guard ok (${mode})`);
