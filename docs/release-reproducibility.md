# Release Reproducibility

Atlas WiKi treats a stable release as reproducible only when the release commit, GitHub tag, GitHub release note, npm `gitHead`, npm integrity, package smoke, and release evidence manifest agree.

## Core Link

`scripts/generate-next-stable-release-evidence.mjs` captures the F9 closure checklist, npm view metadata, GitHub tag state, local release gate evidence, RAG eval metrics, Supabase local smoke output, package smoke output, score evidence, prepublish/postpublish manifests, and required artifact inventory. `scripts/verify-next-stable-release.mjs` binds that evidence to `npm run release:check`.

## Security

Stable publishes run from an authenticated npm operator session. `scripts/publish-guard.mjs` records the publish context and lets npm enforce authentication, permissions, 2FA, and duplicate-version policy.

## Verification

Run:

```bash
npm run release:next-stable-generate
npm run release:check
ATLAS_WIKI_PUBLISHED_SPEC=atlas-wiki@0.2.1 npm run release:published-check
npm view atlas-wiki version dist-tags gitHead dist.integrity dist.shasum time --json
```

The `release-evidence/latest.json` file records the latest published stable baseline. The `release-evidence/atlas-wiki-vNEXT.json` file records the current non-empty release summary. `release-evidence/prepublish-v<version>.json` is committed before tagging; after npm publish, the operator can run `node scripts/generate-next-stable-release-evidence.mjs --postpublish --smoke-ok` and attach `release-evidence/postpublish-v<version>.json` to the GitHub Release.

## Operator Notes

Do not promote `latest` if the tag, release note, npm metadata, or release evidence manifest disagree. For a corrective publish, first land the release commit, verify a fresh clone, then tag and publish from the authenticated local npm operator session. During the pre-publish check for a newly bumped version, the release evidence may still record the already-published registry baseline; after publish, registry metadata should be regenerated or inspected against the new version.
