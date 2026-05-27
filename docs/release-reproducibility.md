# Release Reproducibility

Atlas WiKi treats a stable release as reproducible only when the release commit, GitHub tag, GitHub release note, npm `gitHead`, npm integrity, package smoke, and release evidence manifest agree.

## Core Link

`scripts/generate-next-stable-release-evidence.mjs` captures the source checklist, npm view metadata, GitHub tag state, and required artifact inventory. `scripts/verify-next-stable-release.mjs` binds that evidence to `npm run release:check`.

## Security

Dirty working tree publish is blocked by `scripts/publish-guard.mjs`. Stable publishes are expected to run through `.github/workflows/publish.yml` with GitHub Actions OIDC trusted publishing. Local emergency publish requires `ATLAS_WIKI_EMERGENCY_LOCAL_PUBLISH=true` and must be recorded in release evidence.

## Verification

Run:

```bash
npm run release:next-stable-generate
npm run release:check
ATLAS_WIKI_PUBLISHED_SPEC=atlas-wiki@0.1.1 npm run release:published-check
npm view atlas-wiki version dist-tags gitHead dist.integrity dist.shasum time --json
```

The `release-evidence/atlas-wiki-vNEXT.json` file records the registry version, integrity, shasum, npm `gitHead`, GitHub `v0.1.1` tag/release backfill state, and the 1,536-task coverage ledger.

## Operator Notes

Do not promote `latest` if the tag, release note, npm metadata, or release evidence manifest disagree. For a corrective publish, first land the release commit, verify a fresh clone, then tag and let the trusted publish workflow publish.

