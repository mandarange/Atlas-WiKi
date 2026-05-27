# npm Publishing

The package name is `atlas-wiki`. Publish from the repository root with the official npm command:

```sh
npm publish
```

Run `npm publish --dry-run` before publishing. The package intentionally does not set `publishConfig.provenance`, because automatic provenance generation only works in supported CI/OIDC environments and must not block local `npm publish`. CI releases that need provenance can opt in with `npm publish --provenance` from a supported provider.

Release requires dry-run, tarball install smoke, ESM import smoke, CLI bin smoke, declarations, export allowlist verification, and the post-publish smoke gate.

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
