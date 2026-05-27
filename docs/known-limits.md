# Known Limits

Atlas WiKi 0.1.x is a SQLite-first stable core. It prioritizes reproducibility, typed APIs, local auditability, and safe read-first MCP operation over distributed scale or hosted service features.

## Core Link

`src/store/sqlite-store.ts` is the durable implementation. `src/store/memory-store.ts` is a parity-oriented lightweight implementation. `src/capabilities/coverage.ts` distinguishes implemented capabilities from adapter placeholders.

## Security

The audit chain is tamper-evident inside local SQLite, not an external transparency log. MCP admin write surfaces are safe only with production actor injection and `authorizeTool`. Connector and hosted deployment adapters remain outside the core package.

## Verification

Run:

```bash
npm run release:check
npm run test:context-leakage
npm run test:audit
npm run test:mcp
```

Performance claims require benchmark or operational evidence before promotion beyond this document.

## Operator Notes

Use 0.1.2 for hardening patches. Reserve 0.2.0 for API stabilization, actor-aware MCP authz expansion, CAS write semantics, and MemoryStore parity beyond the stable core.

