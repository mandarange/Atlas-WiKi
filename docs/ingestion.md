# Ingestion

Atlas WiKi ingests local text, Markdown, JSON, JSONL, CSV, and HTML-shaped content through parser contracts and stores source records plus deterministic chunks.

## Core Link

`src/ingest/parsers` normalizes input text, `src/ingest/chunker.ts` creates stable chunks, and `AtlasWiki.ingestText` routes records into the configured store.

## Security

Ingest defaults to private/internal access unless the caller explicitly chooses public visibility. Parser failures are surfaced as typed command failures instead of partial commits.

## Verification

`tests/integration.test.ts` runs CLI ingest and validates search, context-pack, backup, and MCP smoke behavior from the ingested fixture.

## Operator Notes

Use `awiki ingest <file> --title <title> --owner <principal>` for local files. Re-run ingest when source text changes; stable IDs keep duplicate content deterministic.
