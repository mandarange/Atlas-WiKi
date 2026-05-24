# Contributing

Atlas WiKi is TypeScript-first. Human-authored runtime source belongs in `src/**/*.ts`; generated ESM JavaScript and declarations belong in `dist/`.

## Local Checks

```bash
npm run typecheck
npm run build
npm run lint
npm run test
npm run test:security
npm run test:integration
npm run test:types
npm run schemas:validate
npm run package:verify
npm run package:dry-run
npm run package:smoke
```

## Release Gate

A release must prove declaration emit, explicit package exports, tarball installability, CLI execution, ACL-before-context behavior, redaction, stale/conflict markers, audit chain validation, and absence of core adapter hard dependencies.
