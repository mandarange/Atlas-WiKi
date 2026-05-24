# Migration From SKS

Atlas WiKi is agent-neutral. SKS/TriWiki artifacts can be imported as ordinary source-backed records, but core storage does not depend on SKS paths or runtime behavior.

## Core Link

The adapter boundary is documented in `docs/adapter-boundary.md`. Import flows should call the SDK or CLI ingest path so validation, ACL, redaction, and audit behavior remain identical.

## Security

Do not migrate hidden credentials, local session transcripts, or private connector tokens into public records. Review redaction reports before sharing context packs.

## Verification

The release gate checks that core modules do not contain SKS-specific literals and that all adapters use the public store path.

## Operator Notes

Export SKS material to Markdown or JSON first, inspect it, then ingest with explicit owner and visibility settings.
