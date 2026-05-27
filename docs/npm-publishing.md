# npm Publishing

The package name is `atlas-wiki`. Stable publishes are operator-driven from an authenticated local npm session. `scripts/publish-guard.mjs` records the publish context and lets npm enforce login, package ownership, one-time-password challenges, duplicate-version rejection, and registry permissions.

## Core Link

`package.json` exposes `package:dry-run`, `package:smoke`, `release:published-check`, and `release:check`. `scripts/publish-guard.mjs` records dry-run, emergency-local, and local npm-authenticated publish contexts. There are no GitHub Actions CI or publish runners in this repository; release gates are run locally by the operator.

## Security

Local publish uses the operator's npm login and may require a one-time password when 2FA is enabled. Atlas WiKi keeps Node 24+ as the release runtime for local release verification.

## Verification

Run `npm run package:dry-run` before publishing. The wrapper executes `npm publish --dry-run`; when verifying an already-published baseline such as `0.1.1`, it accepts npm's expected already-published conflict only if the registry version matches `package.json`. Release requires dry-run, tarball install smoke, ESM import smoke, CLI bin smoke, declarations, export allowlist verification, and the post-publish smoke gate.

## Operator Notes

Run `npm whoami` first, then `npm publish`; pass `--otp=<code>` when npm returns `EOTP`.

## Release Checklist

- Clean checkout: abort on uncommitted release-output drift.
- `npm ci`: abort on lockfile or engine failure.
- `npm run release:check`: abort on any local gate failure.
- `npm pack`: abort on unexpected files, missing declarations, or missing executable bins.
- Local tarball install: abort on import, CLI, SDK, or MCP export failure.
- Published package install: after publish, run `ATLAS_WIKI_PUBLISHED_SPEC=atlas-wiki@<version> npm run release:published-check`; rollback/deprecate the tag if it fails.
- Global install: verify `awiki --help` and `atlas-wiki --help`.
- CLI init smoke: verify `awiki init --root ./wiki --json`.
- SDK import smoke: verify `import { AtlasWiki } from "atlas-wiki"`.
- MCP readonly smoke: verify `import { createReadonlyAtlasWikiServer } from "atlas-wiki/mcp"`.
- MCP admin authorization smoke: verify admin tools deny without `authorizeTool`.
- Audit verify smoke: verify `awiki audit verify --json`.
- Backup restore smoke: create, verify, restore, then run `awiki validate --json`.
- CHANGELOG review: abort if version/date/security hardening notes are missing.
- GitHub release notes: abort if local release notes omit behavioral or security hardening.
- npm dist-tag verify: abort if `latest` does not point at the intended version.
- Local release gate verify: abort if `npm run release:check` is not green.
- Package README verify: abort if the published README quick start cannot be reproduced.
