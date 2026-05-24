# Retrieval

Retrieval combines SQLite FTS with a plain text fallback, ACL filtering, redaction, freshness markers, conflict markers, and citation construction.

## Core Link

`SqliteStore.search` owns query execution and `SqliteStore.contextPack` builds source-backed context packs. `MemoryStore` implements the same contract for tests and embedded usage.

## Security

Every result is permission-filtered before scoring is returned. Text snippets and context quotes pass through `redactText` before they are exposed.

## Verification

Security tests cover unauthorized filtering and secret redaction. Integration tests cover CLI search and context-pack generation.

## Operator Notes

Use specific source titles or policy terms for best SQLite FTS recall. Context packs are intended for agent input, not as a replacement for source citation review.
