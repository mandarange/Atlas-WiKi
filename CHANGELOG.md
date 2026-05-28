# Changelog

All notable version changes should be recorded in this file before release.

## [Unreleased]

- Keep this section for changes that have landed but are not published yet.

## [0.2.2] - 2026-05-27

### Added

- Add npm-only Supabase setup via `awiki supabase init`, `migrations export`, `migrations list`, `status`, and `doctor`.
- Export typed Supabase migration asset helpers from `atlas-wiki/supabase`.
- Verify packaged and installed `supabase/migrations` assets in package, tarball, type-consumer, and published-package smoke gates.

### Fixed

- Make README Supabase setup copy-pasteable without a GitHub clone.
- Replace placeholder structured extraction sample text with an executable customer profile example.
- Add a runtime Node.js 24+ CLI check before loading SQLite-backed command code.

## [0.2.1] - 2026-05-27

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.
- Bind F9 release evidence to live RAG eval output, Supabase validation smoke artifacts, strict artifact hashes, and explicit published-package version checks.
- Harden Supabase RPC contracts for DB-side CAS authorization and authenticated internal-source RAG parity.

## [0.2.0] - 2026-05-27

### Breaking

- Promote StoreContract to the N9 v2 shape: async `ragVectorStats()`, chunk search, backend vector search, CAS writes, and schema contract registry methods.
- Make `AtlasWiki.ragStatus()` async for all backends. Use `AtlasWiki.ragStatusSync()` only for sync-capable compatibility paths.

### Added

- Add Supabase runtime RPC search paths for `chunk_search` and `rag_search`, with committed N9 SQL contracts and adapter tests.
- Add user-defined structured schema contract registration through the SDK and store backends.
- Add v2 release evidence with prepublish/postpublish manifests, non-empty `vNEXT` summary, and GitHub Release asset upload wiring.
- Add local and published package CLI RAG vector restart smoke coverage.

### Changed

- Route RAG vector retrieval through store-backed backend paths and include backend, retrieval path, profile, chunk, and citation fields in result items.
- Document Supabase pgvector/RPC support, async RAG status migration, schema registry usage, and release evidence gates.

## [0.1.5] - 2026-05-27

### Added

- Add store-backed persistent RAG embeddings for SQLite, MemoryStore contract parity, and Supabase mock adapter coverage.
- Add Gemini embedding mock payload tests for `gemini-embedding-2` and `gemini-embedding-001` model-specific request compatibility.
- Add actor-aware MCP admin authorization context with resolved actor, canonical root, mode, and admin flag.
- Add 0.1.5 stabilization release evidence generation bound to the ATW-95 checklist.

### Changed

- Persist RAG vector indexes across SDK/CLI restarts instead of relying on a per-process in-memory map.
- Store Supabase source chunks and use chunk text for Supabase adapter search citations.
- Enforce built-in structured extraction schema contracts before creating structured objects or proposals.
- Expand local and published package smoke coverage for RAG, Gemini, and deterministic embedding subpath exports.

## [0.1.4] - 2026-05-27

### Added

- Add Supabase store adapters, SQL migrations, RLS policy surfaces, and offline Supabase mock coverage.
- Add structured extraction contracts, deterministic extractors, schemas, and ingestion tests.
- Add RAG search, context-pack support, Gemini embedding adapter, deterministic test embeddings, MCP RAG tools, and RAG release checks.
- Add interactive and non-interactive CLI setup through `awiki setup`, `awiki configure`, `awiki rag enable`, and `awiki rag disable`.
- Add a short README LLM init prompt for Hermess, OpenClaw, and similar agent-building tools.

### Changed

- Document global `npm i -g atlas-wiki` usage for Hermess/OpenCalw-style agent tooling.
- Allow local authenticated `npm publish` while preserving dry-run and GitHub Actions OIDC publish context detection.
- Expand package exports, release evidence, smoke checks, and release gates for the 0.1.4 package.

## [0.1.2] - 2026-05-27

### Fixed

- Keep release metadata aligned after an explicit SKS version bump advances the package version.

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
