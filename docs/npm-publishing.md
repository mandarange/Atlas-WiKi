# npm Publishing

The package name is `atlas-wiki`. Stable publishes can run through GitHub Actions OIDC trusted publishing in `.github/workflows/publish.yml` or from an authenticated local npm operator session. `scripts/publish-guard.mjs` records the publish context and lets npm enforce login, package ownership, one-time-password challenges, duplicate-version rejection, and registry permissions.

## Core Link

`package.json` exposes `package:dry-run`, `package:smoke`, `release:published-check`, and `release:check`. `scripts/publish-guard.mjs` records dry-run, trusted OIDC, emergency-local, and local npm-authenticated publish contexts. `.github/workflows/publish.yml` runs `npm publish` with `id-token: write`, Node 24, npm 11+, and dependency cache disabled.

## Security

npm trusted publishing uses OIDC from the CI provider and avoids long-lived npm publish tokens. Local publish uses the operator's npm login and may require a one-time password when 2FA is enabled. The npm documentation currently requires npm 11.5.1 or later and Node 22.14.0 or later for trusted publishing; Atlas WiKi keeps Node 24+ as the release runtime. The publish workflow disables package-manager cache for the release job and relies on npm's trusted-publishing provenance behavior when CI is used.

## Verification

Run `npm run package:dry-run` before publishing. The wrapper executes `npm publish --dry-run`; when verifying an already-published baseline such as `0.1.1`, it accepts npm's expected already-published conflict only if the registry version matches `package.json`. Release requires dry-run, tarball install smoke, ESM import smoke, CLI bin smoke, declarations, export allowlist verification, and the post-publish smoke gate.

## Operator Notes

Configure the npm package trusted publisher to match `mandarange/Atlas-WiKi` and `.github/workflows/publish.yml` before using the stable workflow. If the trusted publisher identity does not match the workflow, publish can fail even when the package exists. For direct local publish, run `npm whoami` first, then `npm publish`; pass `--otp=<code>` when npm returns `EOTP`.

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
- CI badge verify: abort if the latest main CI badge/run is not green.
- Package README verify: abort if the published README quick start cannot be reproduced.
