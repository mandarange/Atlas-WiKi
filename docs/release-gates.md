# Release Gates

Run `npm run release:check` before publishing. The gate checks type safety, build output, lint policy, unit/integration/security tests, schema definitions, package metadata, npm dry run, and tarball consumer install.

Hardened release candidate gates:

```bash
npm run test:migrations
npm run test:integrity
npm run test:context-leakage
npm run test:mcp
npm run test:audit
npm run package:verify
```

Publishing `latest` is blocked unless these gates and `npm run release:check` pass.
