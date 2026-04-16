# LI.FI Quote Tracker

A local tool that tracks how **lifiIntents** quotes compare to every competing bridge/solver returned by the LI.FI routes API — across chains, pairs, and sizes.

For each route, it calls `@lifi/sdk getRoutes` once. The `lifiIntents` offer is extracted as the intent side of the comparison; all other returned offers (Across, Stargate, CCTP, Relay, Eco, Mayan, etc.) are the alternatives. Results land in SQLite; a local web UI shows snapshot rankings and timeseries.

---

## What it tracks

- **Intent rank** — where the `lifiIntents` offer places by gross output among all competing offers (1 = best)
- **Δ bps** — how many basis points lifiIntents trails the best offer
- **Intent quote / Best quote** — the raw output amounts being compared
- **Best tool** — which bridge returned the best alternative
- **Trend over time** — per-route timeseries after multiple daily runs

**Configured routes:**

| Pair | Sizes | Chains |
|------|-------|--------|
| USDC-USDC | 10, 100, 1,000, 10,000 | Ethereum ↔ Base ↔ Arbitrum |
| USDT-USDT | 10, 100, 1,000, 10,000 | Ethereum ↔ Base ↔ Arbitrum |
| ETH-ETH | 0.01, 0.1, 1 | Ethereum ↔ Base ↔ Arbitrum |
| WETH-ETH | 0.01, 0.1, 1 | Ethereum ↔ Base ↔ Arbitrum |

84 routes per daily run · ~3 min at 1 req/s

---

## Setup

```bash
pnpm install
```

Create `.env` in the repo root with your LI.FI API key (without it, you'll get rate limited to 100 RPM):

```
NEXT_PUBLIC_LIFI_API_KEY=your-key-here
INTEGRATOR_STRING=li.fi-solver
```

---

## Running the UI

Two terminals from the repo root:

```bash
# Terminal 1 — API server (port 5174)
pnpm serve

# Terminal 2 — Vite frontend (port 5173)
pnpm web
```

Or start both at once:

```bash
pnpm dev
```

Open **http://localhost:5173**.

---

## Collecting data

```bash
# Pull all 84 routes
pnpm pull:daily

# Pull a specific route
pnpm pull:adhoc -- --pair USDC-USDC --from-chain 8453 --to-chain 42161 --size 100

# Fan out over all sizes for a pair/route
pnpm pull:adhoc -- --pair ETH-ETH --from-chain 1 --to-chain 8453

# Fan out over all chains for a pair + size
pnpm pull:adhoc -- --pair USDC-USDC --size 1000
```

Data is stored in `db/quotes.db` (SQLite). After collecting, **restart `pnpm serve`** — the server holds the DB file open at startup and won't see new data until restarted.

---

## Resetting the database

Always stop the server before deleting the DB, otherwise it keeps reading the old (deleted) file.

```bash
# 1. Stop pnpm serve (ctrl+C in Terminal 1)
# 2. Remove DB and WAL/SHM sidecars
rm -f db/quotes.db db/quotes.db-shm db/quotes.db-wal
# 3. Collect fresh data
pnpm pull:daily
# 4. Restart the server
pnpm serve
```

---

## UI pages

**Snapshot** (`/`) — one row per (pair, route, size) for the selected run. Columns: Pair · Route · Size · Rank · Δ bps · Intent quote · Best quote · Best tool · Alts. Filter by pair/route/size. Click *chart →* to open the timeseries.

**Timeseries** (`/route`) — two charts for a single route: output amount (intent vs best alt) and intent rank over time. Use the size selector to switch sweeps.

**Help** (`/help`) — step-by-step usage guide.

---

## Status semantics

- `ok` — lifiIntents competed against alternatives on this route
- `partial` — `getRoutes` returned alternatives but no `lifiIntents` offer (common for USDT-USDT and most ETH-ETH routes). Best alt is still stored and displayed.
- `error` — `getRoutes` returned nothing, or token resolution failed

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
├── collector/            # Data collection (TypeScript, tsx)
│   └── src/
│       ├── daily.ts      # Pull all 84 routes
│       ├── adhoc.ts      # Pull a filtered subset
│       ├── lifi.ts       # fetchAlternatives() + rankOffers() + LIFI_INTENT_TOOL
│       ├── runner.ts     # Per-route orchestration + DB writes
│       ├── db.ts         # SQLite helpers
│       ├── config.ts     # Config loading + validation
│       ├── tokens.ts     # Token address resolution (+ hardcoded fallbacks)
│       └── types.ts
├── db/
│   └── schema.sql        # requests + offers tables
├── server/               # Hono read-only API (port 5174)
│   └── src/
│       ├── index.ts
│       └── handlers.ts
├── web/                  # Vite + React + Tailwind v4 (port 5173)
│   └── src/
│       ├── pages/{Snapshot,Timeseries,Help}.tsx
│       └── api.ts
├── .claude/skills/quote/SKILL.md
├── config.json           # Route matrix configuration
└── .env                  # LI.FI API key + integrator string
```

---

## Configuration

Edit `config.json` to change the route matrix, rate limit, or alternatives cap:

```jsonc
{
  "chains": [1, 8453, 42161],
  "assetPairs": [...],
  "rateLimitRps": 1,          // API calls per second
  "alternativesTopN": 20,     // max non-lifiIntents offers stored per request
  "quoteTimeoutMs": 30000
}
```

---

## Tests

```bash
pnpm test         # all workspaces
pnpm typecheck    # TypeScript across all workspaces
```
