# LI.FI Quote Tracker

A local tool for tracking how LI.FI's intent quotes rank against alternative routes over time — across chains, pairs, and sizes.

For each route, it fetches two quotes: an **intent quote** (via `@lifi/cli`) and a ranked **alternatives list** (via `@lifi/sdk`). It stores everything in SQLite and visualises rank, delta, and trends in a local web UI.

---

## What it tracks

- **Intent rank** — where the LI.FI intent offer places among all alternatives (1 = best output)
- **Δ bps** — how many basis points the intent output trails the best offer
- **Trend over time** — per-route timeseries showing when intent wins or loses

**Configured routes:**

| Pair | Sizes | Chains |
|------|-------|--------|
| USDC-USDC | 10, 100, 1,000, 10,000 | Ethereum ↔ Base ↔ Arbitrum |
| USDT-USDT | 10, 100, 1,000, 10,000 | Ethereum ↔ Base ↔ Arbitrum |
| ETH-ETH | 0.01, 0.1, 1 | Ethereum ↔ Base ↔ Arbitrum |
| WETH-ETH | 0.01, 0.1, 1 | Ethereum ↔ Base ↔ Arbitrum |

84 routes per run · ~3 min at 1 req/s

---

## Setup

```bash
# Install dependencies
pnpm install

# Install the LI.FI CLI globally (required for intent quotes)
npm install -g @lifi/cli
```

---

## Collecting data

```bash
# Pull all 84 routes (daily run)
pnpm pull:daily

# Pull a specific route
pnpm pull:adhoc -- --pair USDC-USDC --from-chain 1 --to-chain 8453 --size 100

# Fan out over all sizes for a pair/route
pnpm pull:adhoc -- --pair ETH-ETH --from-chain 1 --to-chain 42161

# Fan out over all chains for a pair + size
pnpm pull:adhoc -- --pair USDT-USDT --size 1000
```

Data is stored in `db/quotes.db` (SQLite, created on first run).

---

## Running the UI

```bash
# Start everything (API server + Vite dev server)
pnpm dev
```

Or separately:

```bash
pnpm server   # API on http://127.0.0.1:5174
pnpm web      # UI  on http://localhost:5173
```

Open **http://localhost:5173**.

---

## UI pages

**Snapshot** (`/`) — table of the latest run. One row per route showing intent rank, Δ bps, tools used, and status. Click "chart →" to drill into timeseries.

**Timeseries** (`/route`) — two charts for a single route: output amount (intent vs best alt) and intent rank over time. Use the size selector to switch between amount sweeps.

**Help** (`/help`) — full usage guide in the UI.

---

## `/quote` slash command (Claude Code)

Inside this repo, Claude Code has a `/quote` skill that translates natural language into collector invocations:

```
/quote pull USDC from Ethereum to Base at 1000
/quote run daily
/quote ETH to Arbitrum, 0.1 ETH
```

---

## Repo structure

```
wtf-they-quoting/
├── collector/          # Data collection scripts
│   └── src/
│       ├── daily.ts    # Pull all 84 routes
│       ├── adhoc.ts    # Pull a filtered subset
│       ├── lifi.ts     # fetchIntent() + fetchAlternatives() + rankOffers()
│       ├── runner.ts   # Per-route orchestration + DB writes
│       ├── db.ts       # SQLite helpers
│       ├── config.ts   # Config loading + validation
│       ├── tokens.ts   # Token address resolution
│       └── types.ts    # Shared types
├── db/
│   └── schema.sql      # requests + offers tables
├── server/             # Hono read-only API (port 5174)
│   └── src/
│       ├── index.ts
│       └── handlers.ts
├── web/                # Vite + React frontend (port 5173)
│   └── src/
│       ├── pages/
│       │   ├── Snapshot.tsx
│       │   ├── Timeseries.tsx
│       │   └── Help.tsx
│       └── api.ts
├── .claude/skills/quote/SKILL.md   # /quote slash command
└── config.json         # Route matrix configuration
```

---

## Configuration

Edit `config.json` to change the route matrix:

```jsonc
{
  "chains": [1, 8453, 42161],
  "assetPairs": [...],
  "rateLimitRps": 1,          // API calls per second
  "alternativesTopN": 20,     // max alternatives stored per request
  "quoteTimeoutMs": 30000
}
```

---

## Tests

```bash
pnpm test         # all workspaces
pnpm typecheck    # TypeScript across all workspaces
```
