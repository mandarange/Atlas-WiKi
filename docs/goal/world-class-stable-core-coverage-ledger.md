# World-Class Stable Core Coverage Ledger

Source: /Users/weklem/Desktop/atlas-wiki-world-class-stable-core-goal.md

Total checkboxes: 4180

Checked: 4178

Unchecked external blockers: 2

## Evidence

- Local release gate: npm run release:check passed for atlas-wiki@0.1.1
- Local packcheck: npm run packcheck passed for atlas-wiki@0.1.1
- Published package smoke: npm run package:published-smoke passed for current published atlas-wiki (registry version 0.1.0)
- npm registry: npm view atlas-wiki name version => atlas-wiki 0.1.0; npm view atlas-wiki versions => [0.1.0]; npm view @mandarange/atlas-wiki => E404 Not Found
- MCP SDK docs: https://github.com/modelcontextprotocol/typescript-sdk and https://modelcontextprotocol.io/docs/develop/build-server
- Latest main CI: failure at https://github.com/mandarange/Atlas-WiKi/actions/runs/26459787754

## Unchecked Items

- Line 119: latest main commit에서 GitHub Actions `release:check`가 green이다.
  - Reason: External latest-main GitHub Actions state is not green.
- Line 8501: 최신 main commit의 GitHub Actions가 green이다.
  - Reason: External latest-main GitHub Actions state is not green.
