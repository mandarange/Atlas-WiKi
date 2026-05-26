# npm Publishing

The package name is `atlas-wiki`. Publish from the repository root with the official npm command:

```sh
npm publish
```

Run `npm publish --dry-run` before publishing. The package intentionally does not set `publishConfig.provenance`, because automatic provenance generation only works in supported CI/OIDC environments and must not block local `npm publish`. CI releases that need provenance can opt in with `npm publish --provenance` from a supported provider.

Release requires dry-run, tarball install smoke, ESM import smoke, CLI bin smoke, declarations, and export allowlist verification.
