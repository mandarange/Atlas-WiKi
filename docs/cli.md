# CLI

Commands: `init`, `setup|configure`, `doctor`, `ingest`, `claim create`, `search`, `fetch`, `context-pack`, `validate`, `migrate report`, `audit verify`, `rebuild-index`, `freshness report`, `conflicts scan`, `export json-shards`, `import json-shards`, `backup create|verify|restore`, `rag status|enable|disable|index|search|context-pack|eval`, `supabase init|status|doctor|migrations`, and `mcp start|smoke`. Use `--json` for machine-readable output.

Supabase npm-only setup commands:

```bash
awiki supabase init --out ./supabase --json
awiki supabase migrations export --out ./supabase/migrations --json
awiki supabase migrations list --json
awiki supabase doctor --url $SUPABASE_URL --key $SUPABASE_ANON_KEY --json
awiki supabase status --json
```

`awiki supabase init` creates `supabase/config.toml`, exports bundled package migrations, skips existing files by default, supports `--dry-run`, and requires `--force` or `--overwrite` to replace existing migration files.

## Core Link

`src/cli/awiki.ts` checks Node.js 24+ before loading the SQLite-backed implementation. `src/cli/main.ts` maps general commands to the SDK facade, and `src/cli/supabase.ts` owns npm-only Supabase setup and doctor commands.

## Security

CLI output is subject to the same ACL and redaction rules as SDK and MCP output. Supabase doctor defaults to anon/publishable keys and warns when `--service-role` is used because service role keys are server-only secrets.

## Verification

Integration and package smoke tests exercise installed CLI execution, ingest, search, context packs, backup, MCP smoke commands, Supabase migration export, and published-package Supabase setup.

## Operator Notes

Use `--root <dir>` or `ATLAS_WIKI_ROOT` to isolate SQLite environments. Use `awiki supabase init --out ./supabase --json` before `npx supabase link --project-ref <project-ref>` and `npx supabase db push` when a project consumes Atlas WiKi from npm rather than a GitHub clone.
