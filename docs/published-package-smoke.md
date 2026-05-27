# Published Package Smoke

The published package smoke installs `atlas-wiki` from the npm registry into a temporary consumer project and exercises import, CLI, SDK, MCP, and audit verification behavior from the installed artifact.

## Core Link

`scripts/published-package-smoke.mjs` installs `ATLAS_WIKI_PUBLISHED_SPEC` or `atlas-wiki` by default. The release gate exposes it as `npm run release:published-check`.

## Security

The smoke test runs outside the repository package tree so it cannot accidentally import local source files. It verifies executable bin mode, shebang, package exports, readonly MCP import, admin MCP import, CLI workflow, and audit verification.

## Verification

Run after publish:

```bash
ATLAS_WIKI_PUBLISHED_SPEC=atlas-wiki@0.1.1 npm run release:published-check
```

The same script is checked by `tests/published-package-smoke.test.ts`.

## Operator Notes

If registry install, import, CLI, SDK, MCP, or audit verification fails, stop `latest` promotion and create a corrective release or rollback/deprecation plan.

