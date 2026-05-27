# Changelog


## [Unreleased]

### Added

- Add next-stable release evidence generation, machine-readable coverage ledger, publish guard, trusted publishing workflow, and dedicated regression tests for MCP authz, audit tail deletion, fetch policy, root safety, and published-package smoke.

## [0.1.1] - 2026-05-26

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.
- Return `AtlasRecord` from `fetch()` with deny-by-default policy checks for non-source records.
- Deny empty search enumeration and keep source listing on the explicit `listSources`/`atlas_wiki.list_sources` surface.
- Require server-side MCP actor injection in production, hide `root`/`as` from production tool schemas, and deny admin MCP tools without `authorizeTool`.
- Add an audit head checkpoint so tail-row deletion is detected by validation.
- Add a reproducible published-package smoke script for post-publish release verification.

## 0.1.0

- Initial TypeScript-first Atlas WiKi package scaffold.
- SQLite source-of-truth store, ACL-filtered search, context packs, audit chain, CLI, SDK, MCP server, package smoke tests, and goal coverage ledger.
