# Published Package Smoke

The published package smoke installs an explicit `atlas-wiki@<version>` package spec from the npm registry into a temporary consumer project and exercises import, CLI, SDK, MCP, RAG, release-export, and audit verification behavior from the installed artifact.

## Core Link

`scripts/published-package-smoke.mjs` requires `ATLAS_WIKI_PUBLISHED_SPEC` or `--package atlas-wiki@<version>` and fails if the installed package version does not match local `package.json`. The release gate exposes it as `npm run release:published-check`.

## Security

The smoke test runs outside the repository package tree so it cannot accidentally import local source files. It verifies executable bin mode, shebang, package exports, readonly MCP import, admin MCP import, CLI workflow, and audit verification.

## Verification

Run after publish:

```bash
ATLAS_WIKI_PUBLISHED_SPEC=atlas-wiki@0.2.1 npm run release:published-check
```

The same script is checked by `tests/published-package-smoke.test.ts`.

## Operator Notes

If registry install, import, CLI, SDK, MCP, or audit verification fails, stop `latest` promotion and create a corrective release or rollback/deprecation plan.
