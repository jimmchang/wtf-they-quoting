# LI.FI Quote Tracker — Design

**Status:** Draft for review (revised 2026-04-16)
**Date:** 2026-04-16
**Author:** jim@li.finance (w/ Claude Code)

## 1. Goal

Track, for a small fixed set of cross-chain routes, **how LI.FI's intent quote
compares to its alternative routes over time** — specifically its rank among
alternatives (1st, 2nd, 3rd, …) and the output-amount delta to the best
alternative. Primary analytical lens: "when does the intent product win or
lose versus the classic router, and by how much?" Single-user local tool.

## 2. Scope

### In scope
- Manual daily pull across a fixed route × size matrix.
- For each route × size, **two LI.FI calls**:
  1. **Intent quote** — from `@lifi/cli` (the CLI is the runtime for this path,
     per user direction). One offer per call.
  2. **Alternatives list** — the ranked route list from LI.FI's classic
     routes endpoint. Many offers per call.
- Store the intent offer, the alternatives (capped at top-N by output), and
  per-request ranking: where the intent offer ranks among the combined set by
  `to_amount_hr` (gross output), plus the absolute and basis-point delta to
  the best offer.
- Ad-hoc single-route or filtered-subset runs from the CLI.
- Claude Code `/quote` slash-command that translates natural-language intent
  into a CLI invocation.
- Local Vite+React frontend: snapshot table (one row per request, showing the
  intent's rank + delta), and a per-route timeseries with intent-vs-best
  overlay and size selector.
- SQLite storage, split into `requests` and `offers` tables.

### Out of scope (v1)
- Same-chain swaps.
- Historical backfill from external sources.
- Alerts / thresholds on rank regressions.
- Auth on the web UI (server binds to `127.0.0.1`).
- Automated scheduling (user wires own cron/launchd if desired).
- Multi-user deployment.
- Net-of-gas ranking metric (we store the inputs; not a primary view in v1).

## 3. Configuration

```jsonc
{
  "chains": [1, 8453, 42161],
  "assetPairs": [
    { "name": "USDC-USDC",  "from": "USDC", "to": "USDC", "sizes": [10, 100, 1000, 10000] },
    { "name": "USDT-USDT",  "from": "USDT", "to": "USDT", "sizes": [10, 100, 1000, 10000] },
    { "name": "ETH-ETH",    "from": "ETH",  "to": "ETH",  "sizes": [0.01, 0.1, 1] },
    { "name": "WETH-ETH",   "from": "WETH", "to": "ETH",  "sizes": [0.01, 0.1, 1] }
  ],
  "crossChainOnly": true,
  "rateLimitRps": 1,                // applied per API call
  "defaultSlippage": 0.005,
  "quoteTimeoutMs": 30000,
  "alternativesTopN": 20            // max alternatives persisted per request
}
```

Per-run volume: 84 requests × 2 API calls = **168 calls**, at 1 rps ≈ ~3 min
wall time. Each request stores 1 intent offer + up to 20 alternatives = up to
21 offer rows per request, so up to 1,764 offer rows per daily run (worst
case).

## 4. Architecture

Three loosely coupled layers in one repo (unchanged shape):

```
wtf-they-quoting/
├── collector/
│   ├── daily.ts
│   ├── adhoc.ts
│   ├── lifi.ts            # fetchIntent() + fetchAlternatives() + rank()
│   ├── tokens.ts
│   ├── runner.ts          # two calls per request, persists both tables
│   ├── db.ts              # insertRequest + insertOffers (transaction)
│   ├── config.ts
│   ├── routes.ts
│   └── types.ts
├── db/schema.sql          # requests + offers tables
├── server/
│   ├── src/index.ts
│   └── src/handlers.ts    # joins across both tables
├── web/
│   ├── src/api.ts
│   ├── src/pages/Snapshot.tsx     # intent rank + delta
│   ├── src/pages/Timeseries.tsx   # intent vs best overlay
│   └── src/components/SizeSelector.tsx
├── .claude/skills/quote/SKILL.md
└── config.json
```

## 5. Data Model

Two tables. One row per request in `requests`; zero-or-more offers per
request in `offers`. Inserts are wrapped in a single transaction.

```sql
CREATE TABLE IF NOT EXISTS requests (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              TEXT NOT NULL,
  run_kind            TEXT NOT NULL CHECK(run_kind IN ('daily','adhoc')),
  ts                  INTEGER NOT NULL,             -- request start, unix ms
  from_chain          INTEGER NOT NULL,
  to_chain            INTEGER NOT NULL,
  pair_name           TEXT NOT NULL,
  from_symbol         TEXT NOT NULL,
  to_symbol           TEXT NOT NULL,
  from_token          TEXT NOT NULL,
  to_token            TEXT NOT NULL,
  from_amount         TEXT NOT NULL,                -- base units
  from_amount_hr      REAL NOT NULL,                -- human-readable
  intent_rank         INTEGER,                      -- 1 = best; NULL if intent missing
  best_to_amount_hr   REAL,                         -- max to_amount_hr across all offers
  intent_to_amount_hr REAL,
  delta_hr            REAL,                         -- best_to_amount_hr - intent_to_amount_hr
  delta_bps           REAL,                         -- 10000 * delta_hr / best_to_amount_hr
  alt_count           INTEGER NOT NULL DEFAULT 0,   -- # of source='routes' offers stored
  latency_intent_ms   INTEGER,
  latency_alts_ms     INTEGER,
  status              TEXT NOT NULL CHECK(status IN ('ok','partial','error')),
  error_message       TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id        INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  source            TEXT NOT NULL CHECK(source IN ('intent','routes')),
  rank_by_to_amount INTEGER,                        -- 1 = highest to_amount_hr in this request
  tool              TEXT,
  to_amount         TEXT,
  to_amount_hr      REAL,
  to_amount_usd     REAL,
  gas_cost_usd      REAL,
  fee_usd           REAL,
  effective_rate    REAL,
  raw_json          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_ts    ON requests(ts);
CREATE INDEX IF NOT EXISTS idx_requests_route ON requests(pair_name, from_chain, to_chain, from_amount_hr);
CREATE INDEX IF NOT EXISTS idx_requests_run   ON requests(run_id);
CREATE INDEX IF NOT EXISTS idx_offers_request ON offers(request_id);
CREATE INDEX IF NOT EXISTS idx_offers_rank    ON offers(request_id, rank_by_to_amount);
```

### Status semantics
- `ok` — both intent and alternatives calls succeeded (at least 1 route
  returned by alternatives).
- `partial` — exactly one of the two calls failed. The successful side is
  still persisted. `intent_rank`, `delta_*`, etc. are populated only when
  both sides are present.
- `error` — both calls failed. `offers` has 0 rows for this request;
  `error_message` carries the combined error summary.

### Ranking metric
`rank_by_to_amount` is computed over the combined set (intent + routes) for a
single request, ordered by `to_amount_hr` descending. Ties are broken by
lower `fee_usd`, then by tool name (stable/deterministic). `intent_rank` on
`requests` mirrors the rank of the `source='intent'` offer.

Gross output (`to_amount_hr`) is the primary ranking metric. Net-of-gas
ranking can be computed on-the-fly from stored columns if we want it later.

### Size note
`raw_json` dominates storage. Worst-case ~1.7k rows/day × a few KB each →
≲3 GB/year. Acceptable short-term; prune policy is an explicit v2 item.

## 6. Collector

### 6.1 LI.FI access

- **Intent quote**: subprocess `npx @lifi/cli <subcommand> --json …` (exact
  subcommand/flags verified at Phase 6 — the CLI docs at
  https://docs.li.fi/cli/overview are authoritative). The collector parses
  stdout JSON. If the CLI exits non-zero, the error body is recorded in
  `raw_json`.
- **Alternatives list**: `@lifi/sdk` `getRoutes({fromChainId, toChainId,
  fromTokenAddress, toTokenAddress, fromAmount, options: { order: 'CHEAPEST'
  /* or RECOMMENDED — verified at Phase 6 */ }})`. Returns `Route[]`.

Both surfaces are hidden behind `lifi.ts`:

```ts
fetchIntent(req, deps): Promise<OfferFetchResult>
fetchAlternatives(req, deps): Promise<OfferFetchResult[]>
```

`OfferFetchResult` is a normalized shape the runner persists as an `offers`
row.

### 6.2 Run flow

`daily.ts`:
1. Load `config.json`; validate.
2. Open SQLite; apply schema.
3. Resolve token addresses for every `(chain, symbol)` used; cache.
4. Generate the 84-request list. Assign `run_id` (ULID).
5. For each request, sequentially:
   1. Start timer; record `ts`.
   2. Call `fetchIntent(...)` with 30s timeout. Record `latency_intent_ms`.
   3. Sleep `1000 / rateLimitRps` ms.
   4. Call `fetchAlternatives(...)` with 30s timeout. Record `latency_alts_ms`.
   5. Sleep `1000 / rateLimitRps` ms.
   6. Truncate alternatives list to `alternativesTopN` by `to_amount_hr` desc.
   7. Compute combined rankings (intent + alternatives) and the
      `intent_rank` / `delta_hr` / `delta_bps` fields.
   8. In one transaction: insert `requests` row, then all `offers` rows.
6. Print summary: run_id, ok/partial/error counts, wall time.

`adhoc.ts`: same flow, request list comes from CLI flags
(`--from-chain`, `--to-chain`, `--pair`, `--size`; missing flags fan out
over configured values). `run_kind = 'adhoc'`.

### 6.3 Error handling
- Each of the two calls is independent; one failing downgrades status to
  `partial` but does not abort the run.
- A JSON parse error from either surface records a synthetic error offer in
  `raw_json` and marks that half as failed.
- Fatal only if SQLite or config can't be opened.

## 7. Server

Hono, `127.0.0.1:5174`, read-only. Endpoints return request + offers joined.

- `GET /api/runs?limit=30` — recent runs (run_id, kind, ts, ok/partial/err).
- `GET /api/snapshot?run_id=<id>` — default: latest `daily` run. One row per
  request, with intent summary + best-offer summary (joined in SQL).
- `GET /api/routes` — distinct `(pair, from_chain, to_chain, from_amount_hr)`
  keys seen in `requests`.
- `GET /api/timeseries?pair=&from=&to=&size=&from_ts=&to_ts=` — per-request
  rows ordered by ts, with both intent and best-alt metrics in each point:
  `{ ts, intent_rank, intent_to_amount_hr, best_to_amount_hr, delta_bps,
     intent_tool, best_tool, status }`.
- `GET /api/request/:id/offers` — full offer list for a single request
  (for drill-down view, v1.1 if time).

No auth; localhost-only.

## 8. Frontend

### 8.1 Snapshot page (`/`)
Table of latest daily run. Columns:

| Pair | From | To | Size | Intent rank | Delta bps | Best tool | Intent tool | Status |

- Rank is color-coded: green (=1), amber (2–3), red (4+).
- Delta bps shows how far behind the best offer the intent is.
- Row → link to timeseries page for that route/size.
- Run picker in header (latest `daily` by default).

### 8.2 Timeseries page (`/route?pair=&from=&to=&size=`)
Size selector (dropdown of sizes seen for that pair/chain pair). Two charts:

1. **Output amount** — two lines: `intent_to_amount_hr` and
   `best_to_amount_hr`. Deviation is visually obvious.
2. **Intent rank** — step line at integer values. Zoomed y-axis 1..max-rank.

Hover a point to see tool names (intent vs best). Rank=1 dots rendered green,
else red-amber.

**Deferred to v1.1:** "all sizes for one pair" small-multiples view; drill
into a single request's full offer list.

## 9. Claude Code skill
Unchanged purpose: `.claude/skills/quote/SKILL.md` defines `/quote`. The
skill's prompt is updated to report both the rank and delta for ad-hoc
runs (since that's the primary analytical output).

## 10. Testing
- **Collector unit tests** — config parsing, route expansion, token
  resolution (mock fetch), intent-parse (fixture), alternatives-parse
  (fixture), rank computation edge cases (ties, intent missing, empty alts).
- **DB integration** — transactional insert of request + offers; query
  shapes used by server.
- **Server handler tests** — seeded in-memory DB + request/offers fixtures;
  one happy-path per endpoint, one missing-params per endpoint.
- **E2E smoke** — a single-route adhoc against live LI.FI; manual only.
- **Web** — type-check only; visual verification in browser.

## 11. Tooling & scripts
Unchanged from prior revision (pnpm workspaces, tsx, Vitest, concurrently).

## 12. Open questions
1. **Exact `@lifi/cli` command for the intent quote.** Verified at Phase 6;
   locked in a `LIFI_INTENT_CMD:` comment at the top of `lifi.ts`. Docs:
   https://docs.li.fi/cli/overview.
2. **Which LI.FI endpoint yields the "alternatives" ranking** — almost
   certainly SDK `getRoutes`, but verify the `order` option and whether it
   returns duplicates across tools.
3. **Rank metric = gross `to_amount` vs net (to_amount − gas − fees).** v1
   uses gross. Inputs for net are stored; switching is a server-side change
   only.
4. **Tie-break rule** — `(to_amount_hr desc, fee_usd asc, tool asc)`. Fine
   for first pass; surface if it causes confusion.
5. **Top-N alternatives cap** — 20. Worth revisiting once we see typical
   list sizes.

## 13. Risks / notes
- **API volume doubled** (168 calls per daily run) — still comfortably under
  any sensible LI.FI rate limit at 1 rps.
- **CLI brittleness** — stdout format can change between CLI versions. We
  pin `@lifi/cli` version and capture `raw_json` so a parser fix is just a
  code change, not data loss.
- **Ranking comparability** — `getRoutes` and intent quotes may differ in
  how they account for gas/slippage; `raw_json` preserves both for audit.
- `raw_json` growth under the new model: up to ~1.7k rows/day; ~3 GB/year
  worst case. Pruning is v2.

## 14. Future work (explicit non-goals for v1)
- Net-of-gas ranking toggle.
- Drill-down page showing every offer for a request, full tool breakdown.
- Small-multiples chart (all sizes for a pair at once).
- Alerting when intent rank degrades below a threshold.
- Comparing LI.FI quotes against other aggregators.
- Deployable build with auth.
- Retention / pruning policy for `raw_json`.
