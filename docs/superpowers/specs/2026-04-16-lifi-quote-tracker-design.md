# LI.FI Quote Tracker — Design

**Status:** Draft for review
**Date:** 2026-04-16
**Author:** jim@li.finance (w/ Claude Code)

## 1. Goal

Track cross-chain quote quality from LI.FI over time for a small fixed set of
routes, so we can spot regressions and study how fees / effective rates / tool
selection shift. Personal / analytical tool — single user, localhost-only.

## 2. Scope

### In scope
- Manual daily pull of quotes across a fixed route × size matrix.
- Ad-hoc single-quote or filtered-subset runs from the CLI.
- Claude Code slash-command that translates natural-language intent into a
  CLI invocation (e.g. "quote 5k USDC Eth→Base" → `adhoc.ts` flags).
- SQLite-backed storage of every quote, including the raw response.
- Local Vite + React frontend with a latest-snapshot table and a per-route
  timeseries chart.

### Out of scope (for now)
- Same-chain swaps (e.g. WETH→ETH on Arbitrum only).
- Historical backfill from external sources.
- Alerts / threshold notifications.
- Auth on the web UI (server binds to `127.0.0.1`).
- Automated scheduling (user wires their own cron / launchd if desired).
- Multi-user deployment.

## 3. Configuration

A single `config.json` at the repo root defines the matrix.

```jsonc
{
  "chains": [1, 8453, 42161],           // Ethereum, Base, Arbitrum
  "assetPairs": [
    { "name": "USDC-USDC",  "from": "USDC", "to": "USDC", "sizes": [10, 100, 1000, 10000] },
    { "name": "USDT-USDT",  "from": "USDT", "to": "USDT", "sizes": [10, 100, 1000, 10000] },
    { "name": "ETH-ETH",    "from": "ETH",  "to": "ETH",  "sizes": [0.01, 0.1, 1] },
    { "name": "WETH-ETH",   "from": "WETH", "to": "ETH",  "sizes": [0.01, 0.1, 1] }
  ],
  "crossChainOnly": true,                // skip same-chain source=dest routes
  "rateLimitRps": 1,                     // be polite; sequential in practice
  "defaultSlippage": 0.005               // 0.5%, passed to quote call
}
```

Directed chain pairs are generated as the ordered pairs of distinct chains:
6 pairs. Total matrix size per daily run:

| Pair       | Sizes | Directed chain pairs | Quotes |
|------------|-------|----------------------|--------|
| USDC-USDC  | 4     | 6                    | 24     |
| USDT-USDT  | 4     | 6                    | 24     |
| ETH-ETH    | 3     | 6                    | 18     |
| WETH-ETH   | 3     | 6                    | 18     |
| **Total**  |       |                      | **84** |

Token addresses per chain are resolved via the LI.FI tokens endpoint at
startup and cached in memory for the run.

## 4. Architecture

Three loosely coupled layers in one repo:

```
wtf-they-quoting/
├── collector/          # Node/TS: pulls quotes, writes to SQLite
│   ├── daily.ts        # runs the full matrix
│   ├── adhoc.ts        # CLI flags: --from-chain, --to-chain, --pair, --size
│   ├── lifi.ts         # thin wrapper over CLI or SDK (see §6)
│   ├── tokens.ts       # resolves symbol→address per chain
│   └── db.ts           # insert + run_id bookkeeping
├── db/
│   ├── schema.sql
│   └── quotes.db       # gitignored
├── server/             # Hono: serves /api/* from quotes.db
│   └── index.ts
├── web/                # Vite + React + Recharts
│   ├── src/pages/Snapshot.tsx
│   ├── src/pages/Timeseries.tsx
│   └── …
├── .claude/skills/quote/
│   └── SKILL.md        # NL → collector invocation
├── config.json
└── package.json        # workspace; shared tsconfig
```

Collector and server both open the same SQLite file. The web app talks only to
the server. The Claude Code skill shells out to the collector.

## 5. Data Model

One table, one row per quote.

```sql
CREATE TABLE quotes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL,              -- groups quotes from one invocation
  run_kind        TEXT NOT NULL,              -- 'daily' | 'adhoc'
  ts              INTEGER NOT NULL,           -- unix ms, quote-request time
  from_chain      INTEGER NOT NULL,
  to_chain        INTEGER NOT NULL,
  pair_name       TEXT NOT NULL,              -- 'USDC-USDC' etc
  from_token      TEXT NOT NULL,              -- address
  to_token        TEXT NOT NULL,              -- address
  from_symbol     TEXT NOT NULL,
  to_symbol       TEXT NOT NULL,
  from_amount     TEXT NOT NULL,              -- base units, string for precision
  from_amount_hr  REAL NOT NULL,              -- human-readable (10, 100, 1.0…)
  to_amount       TEXT,                       -- base units; null on failure
  to_amount_hr    REAL,
  to_amount_usd   REAL,
  gas_cost_usd    REAL,
  fee_usd         REAL,
  effective_rate  REAL,                       -- to_amount_hr / from_amount_hr
  tool            TEXT,                       -- chosen bridge/dex tool id
  latency_ms      INTEGER NOT NULL,
  status          TEXT NOT NULL,              -- 'ok' | 'error'
  error_message   TEXT,
  raw_json        TEXT NOT NULL               -- full quote response or error body
);

CREATE INDEX idx_quotes_ts ON quotes(ts);
CREATE INDEX idx_quotes_route ON quotes(pair_name, from_chain, to_chain, from_amount_hr);
CREATE INDEX idx_quotes_run ON quotes(run_id);
```

`raw_json` bloats the DB over time; acceptable at this scale (single user,
~84 rows/day → ~30k rows/year). Can be pruned later if it grows.

## 6. Collector

### 6.1 LI.FI access: CLI vs SDK

Design decision: **try `@lifi/cli` first, fall back to `@lifi/sdk`.**

- The user asked for CLI use. If `npx @lifi/cli quote …` emits clean JSON
  (stdout parseable, exit code reliable), we use it.
- If stdout is human-formatted only, we call `@lifi/sdk`'s `getQuote` directly
  — strictly more reliable and faster, and the CLI is itself a thin wrapper.

A 5-minute verification at implementation-plan time settles this. The rest of
the design doesn't depend on the answer: `lifi.ts` exposes
`getQuote(routeRequest): Promise<QuoteResult>` regardless.

### 6.2 Run flow

`daily.ts`:

1. Load `config.json`.
2. Open SQLite, ensure schema.
3. Resolve token addresses for every `(chain, symbol)` pair used.
4. Generate the full request list (84 items).
5. Assign a `run_id` (ULID) and `run_kind = 'daily'`.
6. For each request, sequentially:
   - Call `lifi.getQuote(...)` with a 30s timeout.
   - On success: compute derived fields (`effective_rate`, USD values from
     response), insert row with `status = 'ok'`.
   - On failure: insert row with `status = 'error'`, `error_message`, and the
     error body as `raw_json`. Do not abort the run.
   - Sleep `1000ms / rateLimitRps` between calls.
7. Print a summary: run_id, ok/err counts, wall time.

`adhoc.ts`: same flow, but the request list is built from CLI flags.

```
adhoc.ts --pair USDC-USDC --from-chain 1 --to-chain 8453 --size 5000
adhoc.ts --pair ETH-ETH --size 0.1                      # all directed chain pairs
adhoc.ts --from-chain 1 --to-chain 42161                # all configured pairs/sizes
```

Missing flags fan out over all configured values for that dimension.
`run_kind` is `'adhoc'`.

### 6.3 Error handling

- Network / timeout / 5xx: recorded as `status='error'`, run continues.
- 4xx (e.g. no route found): also `status='error'`, distinguishable by body.
- Unexpected exception: logged, recorded as error row, run continues.
- The only fatal condition is "can't open SQLite" or "can't load config" —
  exit non-zero before any work begins.

## 7. Server

Single-file **Hono** app bound to `127.0.0.1:5174`. Read-only endpoints:

- `GET /api/routes` — list of distinct `(pair, from_chain, to_chain, size)`
  keys known to exist in the DB.
- `GET /api/snapshot?run_id=<id>` — all rows in a run. Defaults to the latest
  `daily` run.
- `GET /api/runs?limit=30` — recent runs metadata (id, kind, ts, ok/err count).
- `GET /api/timeseries?pair=&from_chain=&to_chain=&size=&from=&to=` — ordered
  list of `(ts, effective_rate, fee_usd, gas_cost_usd, tool, status)`.

No auth. CORS open to localhost only. No writes.

## 8. Frontend

Vite + React + Recharts, served by `vite` in dev, `vite build` + `vite preview`
for demo. Two routes:

### 8.1 Snapshot page (`/`)
Default view. Table of the latest daily run:

| Pair | From chain | To chain | Size | Effective rate | Fee $ | Gas $ | Tool | Status |

Sortable, filterable by pair/chain. A "runs" dropdown in the header lets the
user pick an older run.

### 8.2 Timeseries page (`/route`)
URL params select the route: `?pair=USDC-USDC&from=1&to=8453&size=1000`.

- Size selector (dropdown) — the slippage-curve dimension.
- Two charts stacked: effective rate over time; fee_usd over time.
- Tool swaps are marked by colored dots on the rate line.

**Deferred:** small-multiples view ("all sizes for this pair at once"). Easy
follow-up once the single-size view is working.

## 9. Claude Code skill

`.claude/skills/quote/SKILL.md` defines a slash-command `/quote` available in
this repo. Its contract:

- Input: free-form natural language ("pull today's quotes", "quote 5k USDC
  Eth to Base", "1 ETH every direction").
- Behavior: the model parses intent into one of the collector invocations and
  runs it via Bash. For ambiguous cases it asks one clarifying question.
- Output: the `run_id`, counts, and a brief table of the inserted rows (or a
  link to the timeseries URL for single-route pulls).

No runtime model cost for the actual daily pull — the user runs
`node collector/daily.ts` directly (or wires it to cron). The skill is for
ad-hoc human-driven exploration.

## 10. Testing

- **Collector unit tests** — `tokens.ts` (symbol→address resolution),
  config expansion into route list, response-to-row mapping (with fixture
  quote payloads).
- **DB integration** — round-trip insert + read against a temp SQLite file.
- **Server** — one happy-path test per endpoint against a seeded DB.
- **E2E smoke** — a single-route `adhoc.ts` call against live LI.FI,
  run only locally / manually (network-dependent, not in CI).

No tests for the React UI beyond type-checking. Visual verification in browser.

## 11. Tooling & scripts

- Package manager: `pnpm` workspaces (root + `web`).
- TS throughout, `tsx` for running scripts.
- Top-level scripts in `package.json`:
  - `pnpm pull:daily` → `tsx collector/daily.ts`
  - `pnpm pull:adhoc -- …` → `tsx collector/adhoc.ts`
  - `pnpm server` → `tsx server/index.ts`
  - `pnpm web` → `vite` (in `web/`)
  - `pnpm dev` → server + web concurrently (concurrently package)

## 12. Open questions

1. `@lifi/cli quote` JSON output shape — to be verified at implementation-plan
   time. If not machine-friendly, collector uses `@lifi/sdk` directly.
2. Are we happy with effective-rate as the primary quality metric, or do we
   also want `to_amount_usd - from_amount_usd` (net value) as a first-class
   column? (Currently derivable from stored fields.)
3. Should failed quotes retry once before recording as error? (Currently no
   retry; keeps results clean and fast.)

## 13. Risks / notes

- LI.FI rate limits: 84 req/day is trivial; bursts from `adhoc.ts` fan-outs
  stay under 1 rps. No concern unless config grows.
- Token address drift: chain listings change rarely; we resolve at run-time
  so we don't hard-code stale addresses.
- `raw_json` growth: ~30k rows/year, each a few KB; ~100MB/year worst case.
  Acceptable. Can add a prune job later.

## 14. Future work (explicit non-goals for v1)

- Small-multiples chart.
- Alerting on effective-rate regressions.
- Comparing LI.FI quotes against other aggregators.
- Deployable build (Fly.io / Render) with auth.
- Retention / pruning policy for `raw_json`.
