# Release Gates

Run `npm run release:check` before publishing. The gate checks type safety, build output, lint policy, unit/integration/security tests, schema definitions, package metadata, npm dry run, and tarball consumer install. For an already-published reproducibility baseline, `npm run package:dry-run` accepts npm's version-exists response only when the registry version equals `package.json`. A new release candidate version must not already exist on npm; bump patch/minor metadata before tagging.

Hardened release candidate gates:

```bash
npm run test:migrations
npm run test:integrity
npm run test:context-leakage
npm run test:mcp
npm run test:audit
npm run package:verify
npm run packcheck
npm run release:next-stable-verify
npm run release:published-check
```

Publishing `latest` is blocked unless the local gates and `npm run release:check` pass. After publish, run `npm run release:published-check` against the published package spec, for example `ATLAS_WIKI_PUBLISHED_SPEC=atlas-wiki@0.2.0 npm run release:published-check`.
