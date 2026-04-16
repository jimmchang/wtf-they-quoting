# LI.FI Quote Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local tool that, for each route × size, fetches both the LI.FI intent quote and its alternatives, ranks the intent among those alternatives, stores everything in SQLite, and displays the rank/delta over time in a Vite+React UI. A Claude Code `/quote` skill invokes the collector in natural language.

**Architecture:** Node/TS monorepo (pnpm workspaces): `collector/` makes two LI.FI calls per request (intent via `@lifi/cli`, alternatives via `@lifi/sdk`), writes to `requests` + `offers` tables in a single SQLite file, computes rank/delta at write time. `server/` (Hono) serves read-only join queries. `web/` (Vite+React+Recharts) shows a snapshot table (rank, delta_bps) and per-route timeseries (intent-vs-best overlay + rank step chart). `.claude/skills/quote/` is the NL→CLI translator.

**Tech Stack:** TypeScript, pnpm, tsx, Vitest, better-sqlite3, zod, ulid, commander, Hono, @hono/node-server, @lifi/sdk, Vite, React 18, react-router-dom, Recharts.

**Spec:** `docs/superpowers/specs/2026-04-16-lifi-quote-tracker-design.md`

---

## Execution Rules (from `CLAUDE.md`)

- **Stage, don't commit.** Every "Commit" step ends with `git add <files>` and the exact `git commit -m "…"` command for the user to run.
- **Phase boundary = user approval.** Pause after each phase verification before starting the next.
- **File cap per phase: 5** real code/config files (test files count separately).
- **Forced verification.** Each phase ends with `pnpm typecheck` and tests green before staging.
- **Re-read before edit.** Any task modifying an existing file starts with a Read.

---

## File Structure (target)

```
wtf-they-quoting/
├── package.json                    # workspace root, scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .node-version
├── config.json
│
├── collector/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── types.ts                # RouteRequest, OfferFetchResult, RequestRow, OfferRow
│       ├── config.ts               # zod-validated config loader
│       ├── routes.ts               # expand config → RouteRequest[]
│       ├── tokens.ts               # symbol→address via LI.FI /tokens
│       ├── db.ts                   # openDb, insertRequest+Offers (tx), getLatestRun
│       ├── lifi.ts                 # fetchIntent() + fetchAlternatives() + rankOffers()
│       ├── runner.ts               # run loop: two calls per request, rank, insert
│       ├── daily.ts                # entry point
│       └── adhoc.ts                # entry point (commander flags)
│   └── test/
│       ├── config.test.ts
│       ├── routes.test.ts
│       ├── tokens.test.ts
│       ├── db.test.ts
│       ├── lifi.test.ts            # fixture-based, no network
│       ├── runner.test.ts
│       └── fixtures/
│           ├── intent-response.json
│           └── routes-response.json
│
├── db/
│   └── schema.sql
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       └── handlers.ts
│   └── test/
│       └── handlers.test.ts
│
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts
│       ├── pages/
│       │   ├── Snapshot.tsx
│       │   └── Timeseries.tsx
│       └── components/
│           └── SizeSelector.tsx
│
└── .claude/skills/quote/
    └── SKILL.md
```

---

## Phase 1 — Repo bootstrap

**Goal:** Empty repo → working pnpm workspace with TS, Vitest, scripts, and route config. No runtime code.

**Files:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.node-version`, `config.json`

### Task 1.1: Root files

- [ ] **Step 1 — Create `package.json`**

```json
{
  "name": "wtf-they-quoting",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "pull:daily": "pnpm --filter collector daily",
    "pull:adhoc": "pnpm --filter collector adhoc",
    "server": "pnpm --filter server dev",
    "web": "pnpm --filter web dev",
    "dev": "concurrently -k \"pnpm server\" \"pnpm web\""
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2 — Create `pnpm-workspace.yaml`**

```yaml
packages:
  - collector
  - server
  - web
```

- [ ] **Step 3 — Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 4 — Create `.gitignore`**

```
node_modules/
*.log
.DS_Store
dist/
db/quotes.db
db/quotes.db-journal
.vite/
.env
.env.local
coverage/
```

- [ ] **Step 5 — Create `.node-version`**

```
20.17.0
```

### Task 1.2: Route config

- [ ] **Step 1 — Create `config.json`**

```json
{
  "chains": [1, 8453, 42161],
  "assetPairs": [
    { "name": "USDC-USDC", "from": "USDC", "to": "USDC", "sizes": [10, 100, 1000, 10000] },
    { "name": "USDT-USDT", "from": "USDT", "to": "USDT", "sizes": [10, 100, 1000, 10000] },
    { "name": "ETH-ETH",   "from": "ETH",  "to": "ETH",  "sizes": [0.01, 0.1, 1] },
    { "name": "WETH-ETH",  "from": "WETH", "to": "ETH",  "sizes": [0.01, 0.1, 1] }
  ],
  "crossChainOnly": true,
  "rateLimitRps": 1,
  "defaultSlippage": 0.005,
  "quoteTimeoutMs": 30000,
  "alternativesTopN": 20
}
```

### Task 1.3: Install + commit

- [ ] Run: `pnpm install`
- [ ] Stage:
```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .node-version config.json pnpm-lock.yaml
```
User runs:
```bash
git commit -m "chore: bootstrap pnpm workspace and route config"
```

### Phase 1 verification
- `pnpm install` succeeds with no errors.

**Pause for user approval before Phase 2.**

---

## Phase 2 — Schema + collector scaffold + types

**Goal:** Canonical `requests`+`offers` schema; `collector` package with tsconfig, Vitest, and shared type definitions. No logic.

**Files:** `db/schema.sql`, `collector/package.json`, `collector/tsconfig.json`, `collector/src/types.ts`

### Task 2.1: Schema

- [ ] **Create `db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS requests (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              TEXT NOT NULL,
  run_kind            TEXT NOT NULL CHECK(run_kind IN ('daily','adhoc')),
  ts                  INTEGER NOT NULL,
  from_chain          INTEGER NOT NULL,
  to_chain            INTEGER NOT NULL,
  pair_name           TEXT NOT NULL,
  from_symbol         TEXT NOT NULL,
  to_symbol           TEXT NOT NULL,
  from_token          TEXT NOT NULL,
  to_token            TEXT NOT NULL,
  from_amount         TEXT NOT NULL,
  from_amount_hr      REAL NOT NULL,
  intent_rank         INTEGER,
  best_to_amount_hr   REAL,
  intent_to_amount_hr REAL,
  delta_hr            REAL,
  delta_bps           REAL,
  alt_count           INTEGER NOT NULL DEFAULT 0,
  latency_intent_ms   INTEGER,
  latency_alts_ms     INTEGER,
  status              TEXT NOT NULL CHECK(status IN ('ok','partial','error')),
  error_message       TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id        INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  source            TEXT NOT NULL CHECK(source IN ('intent','routes')),
  rank_by_to_amount INTEGER,
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

### Task 2.2: Collector package

- [ ] **Create `collector/package.json`**

```json
{
  "name": "collector",
  "private": true,
  "type": "module",
  "scripts": {
    "daily": "tsx src/daily.ts",
    "adhoc": "tsx src/adhoc.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@lifi/sdk": "^3.5.0",
    "better-sqlite3": "^11.3.0",
    "commander": "^12.1.0",
    "ulid": "^2.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Create `collector/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

### Task 2.3: Shared types

- [ ] **Create `collector/src/types.ts`**

```ts
export type ChainId = number;
export type Address = `0x${string}`;
export type RunKind = "daily" | "adhoc";
export type RequestStatus = "ok" | "partial" | "error";
export type OfferSource = "intent" | "routes";

export interface AssetPair {
  name: string;
  from: string;
  to: string;
  sizes: number[];
}

export interface AppConfig {
  chains: ChainId[];
  assetPairs: AssetPair[];
  crossChainOnly: boolean;
  rateLimitRps: number;
  defaultSlippage: number;
  quoteTimeoutMs: number;
  alternativesTopN: number;
}

export interface RouteRequest {
  pairName: string;
  fromChain: ChainId;
  toChain: ChainId;
  fromSymbol: string;
  toSymbol: string;
  fromAmountHr: number;
}

/** Normalized result from either the intent or alternatives call */
export interface OfferFetchResult {
  ok: boolean;
  tool?: string;
  toAmount?: string;          // base units
  toAmountHr?: number;
  toAmountUsd?: number;
  gasCostUsd?: number;
  feeUsd?: number;
  errorMessage?: string;
  rawJson: string;
  latencyMs: number;
}

/** Persisted row in `requests` table */
export interface RequestRow {
  run_id: string;
  run_kind: RunKind;
  ts: number;
  from_chain: ChainId;
  to_chain: ChainId;
  pair_name: string;
  from_symbol: string;
  to_symbol: string;
  from_token: Address;
  to_token: Address;
  from_amount: string;
  from_amount_hr: number;
  intent_rank: number | null;
  best_to_amount_hr: number | null;
  intent_to_amount_hr: number | null;
  delta_hr: number | null;
  delta_bps: number | null;
  alt_count: number;
  latency_intent_ms: number | null;
  latency_alts_ms: number | null;
  status: RequestStatus;
  error_message: string | null;
}

/** Persisted row in `offers` table (id added by SQLite) */
export interface OfferRow {
  request_id: number;
  source: OfferSource;
  rank_by_to_amount: number | null;
  tool: string | null;
  to_amount: string | null;
  to_amount_hr: number | null;
  to_amount_usd: number | null;
  gas_cost_usd: number | null;
  fee_usd: number | null;
  effective_rate: number | null;
  raw_json: string;
}
```

### Task 2.4: Install + typecheck + commit

- [ ] Run: `pnpm install`
- [ ] Run: `pnpm --filter collector typecheck` — expect no errors.
- [ ] Stage:
```bash
git add db/schema.sql collector/package.json collector/tsconfig.json collector/src/types.ts pnpm-lock.yaml
```
User runs:
```bash
git commit -m "feat(collector): schema (requests+offers) and types"
```

### Phase 2 verification
- `pnpm --filter collector typecheck` passes.

**Pause for user approval before Phase 3.**

---

## Phase 3 — DB layer (TDD)

**Goal:** `db.ts` opens SQLite, applies schema, and exposes `insertRequestWithOffers` (transactional) plus `getLatestRun`.

**Files:** `collector/src/db.ts`
**Tests:** `collector/test/db.test.ts`

### Task 3.1: Failing test

- [ ] **Create `collector/test/db.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, insertRequestWithOffers, getLatestRun } from "../src/db.js";
import type { RequestRow, OfferRow } from "../src/types.js";

const mkReq = (overrides: Partial<RequestRow> = {}): RequestRow => ({
  run_id: "run1", run_kind: "daily", ts: 1000,
  from_chain: 1, to_chain: 8453,
  pair_name: "USDC-USDC", from_symbol: "USDC", to_symbol: "USDC",
  from_token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  to_token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  from_amount: "1000000000", from_amount_hr: 1000,
  intent_rank: 2, best_to_amount_hr: 999, intent_to_amount_hr: 997,
  delta_hr: 2, delta_bps: 20.02, alt_count: 5,
  latency_intent_ms: 400, latency_alts_ms: 600,
  status: "ok", error_message: null,
  ...overrides,
});

const mkOffer = (requestId: number, overrides: Partial<OfferRow> = {}): OfferRow => ({
  request_id: requestId, source: "intent", rank_by_to_amount: 2,
  tool: "across", to_amount: "997000000", to_amount_hr: 997,
  to_amount_usd: 997, gas_cost_usd: 0.5, fee_usd: 0.3,
  effective_rate: 0.997, raw_json: "{}",
  ...overrides,
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "qt-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("db", () => {
  it("creates both tables on open", () => {
    const db = openDb(join(dir, "q.db"));
    const names = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]).map(r => r.name);
    expect(names).toContain("requests");
    expect(names).toContain("offers");
  });

  it("insertRequestWithOffers inserts request and returns its id", () => {
    const db = openDb(join(dir, "q.db"));
    const req = mkReq();
    const reqId = insertRequestWithOffers(db, req, []);
    expect(typeof reqId).toBe("number");
    const row = db.prepare("SELECT * FROM requests WHERE id=?").get(reqId) as RequestRow & { id: number };
    expect(row.pair_name).toBe("USDC-USDC");
    expect(row.intent_rank).toBe(2);
  });

  it("insertRequestWithOffers inserts offers linked by request_id", () => {
    const db = openDb(join(dir, "q.db"));
    const reqId = insertRequestWithOffers(db, mkReq(), [
      mkOffer(0, { source: "intent", rank_by_to_amount: 2 }),
      mkOffer(0, { source: "routes", rank_by_to_amount: 1 }),
    ]);
    const offers = db.prepare("SELECT * FROM offers WHERE request_id=?").all(reqId) as OfferRow[];
    expect(offers).toHaveLength(2);
    expect(offers.map(o => o.source).sort()).toEqual(["intent", "routes"]);
  });

  it("is transactional — if offers fail, request is rolled back", () => {
    const db = openDb(join(dir, "q.db"));
    const badOffer = mkOffer(0, { source: "INVALID" as any });
    expect(() =>
      insertRequestWithOffers(db, mkReq(), [badOffer])
    ).toThrow();
    const count = (db.prepare("SELECT COUNT(*) as c FROM requests").get() as { c: number }).c;
    expect(count).toBe(0);
  });

  it("getLatestRun returns the most recent daily run_id", () => {
    const db = openDb(join(dir, "q.db"));
    insertRequestWithOffers(db, mkReq({ run_id: "r1", ts: 100 }), []);
    insertRequestWithOffers(db, mkReq({ run_id: "r2", ts: 200 }), []);
    const latest = getLatestRun(db, "daily");
    expect(latest?.run_id).toBe("r2");
  });
});
```

- [ ] Run: `pnpm --filter collector test` — expect fail ("Cannot find module").

### Task 3.2: Implementation

- [ ] **Create `collector/src/db.ts`**

```ts
import Database, { type Database as DB } from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RequestRow, OfferRow, RunKind } from "./types.js";

const SCHEMA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../db/schema.sql"
);

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(SCHEMA, "utf8"));
  return db;
}

const REQUEST_COLS = [
  "run_id","run_kind","ts","from_chain","to_chain","pair_name",
  "from_symbol","to_symbol","from_token","to_token",
  "from_amount","from_amount_hr","intent_rank","best_to_amount_hr",
  "intent_to_amount_hr","delta_hr","delta_bps","alt_count",
  "latency_intent_ms","latency_alts_ms","status","error_message"
] as const;

const OFFER_COLS = [
  "request_id","source","rank_by_to_amount","tool",
  "to_amount","to_amount_hr","to_amount_usd","gas_cost_usd",
  "fee_usd","effective_rate","raw_json"
] as const;

export function insertRequestWithOffers(
  db: DB, req: RequestRow, offers: OfferRow[]
): number {
  const insertReq = db.prepare(
    `INSERT INTO requests (${REQUEST_COLS.join(",")})
     VALUES (${REQUEST_COLS.map(c => `@${c}`).join(",")})`
  );
  const insertOffer = db.prepare(
    `INSERT INTO offers (${OFFER_COLS.join(",")})
     VALUES (${OFFER_COLS.map(c => `@${c}`).join(",")})`
  );

  return db.transaction(() => {
    const result = insertReq.run(req);
    const reqId = result.lastInsertRowid as number;
    for (const o of offers) {
      insertOffer.run({ ...o, request_id: reqId });
    }
    return reqId;
  })();
}

export interface RunSummary {
  run_id: string;
  run_kind: RunKind;
  ts: number;
  ok_count: number;
  partial_count: number;
  err_count: number;
}

export function getLatestRun(db: DB, kind?: RunKind): RunSummary | null {
  const where = kind ? "WHERE run_kind = ?" : "";
  const params = kind ? [kind] : [];
  return (db.prepare(
    `SELECT run_id, run_kind, MAX(ts) AS ts,
       SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok_count,
       SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) AS partial_count,
       SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS err_count
     FROM requests ${where}
     GROUP BY run_id ORDER BY MAX(ts) DESC LIMIT 1`
  ).get(...params) as RunSummary | undefined) ?? null;
}
```

- [ ] Run: `pnpm --filter collector test` — expect 5 passing.
- [ ] Run: `pnpm --filter collector typecheck` — expect clean.

### Task 3.3: Commit

```bash
git add collector/src/db.ts collector/test/db.test.ts
```
User runs:
```bash
git commit -m "feat(collector): transactional db layer for requests+offers"
```

### Phase 3 verification
- 5 tests pass. Typecheck clean.

**Pause for user approval before Phase 4.**

---

## Phase 4 — Config + route expansion (TDD)

**Goal:** `config.ts` loads and validates `config.json`; `routes.ts` expands it into `RouteRequest[]`. Unchanged from original plan aside from `alternativesTopN` in the config schema.

**Files:** `collector/src/config.ts`, `collector/src/routes.ts`
**Tests:** `collector/test/config.test.ts`, `collector/test/routes.test.ts`

### Task 4.1: Config

- [ ] **Create `collector/test/config.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config.js";

const valid = {
  chains: [1, 8453], crossChainOnly: true, rateLimitRps: 1,
  defaultSlippage: 0.005, quoteTimeoutMs: 30000, alternativesTopN: 20,
  assetPairs: [{ name: "U", from: "USDC", to: "USDC", sizes: [10] }],
};

describe("parseConfig", () => {
  it("accepts valid config", () => {
    expect(parseConfig(valid).alternativesTopN).toBe(20);
  });
  it("rejects empty chains", () => {
    expect(() => parseConfig({ ...valid, chains: [] })).toThrow();
  });
  it("rejects zero sizes in a pair", () => {
    expect(() => parseConfig({
      ...valid,
      assetPairs: [{ name: "x", from: "A", to: "B", sizes: [] }],
    })).toThrow();
  });
});
```

- [ ] **Create `collector/src/config.ts`**

```ts
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { AppConfig } from "./types.js";

const Schema = z.object({
  chains: z.array(z.number().int().positive()).min(2),
  assetPairs: z.array(z.object({
    name: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    sizes: z.array(z.number().positive()).min(1),
  })).min(1),
  crossChainOnly: z.boolean(),
  rateLimitRps: z.number().positive(),
  defaultSlippage: z.number().min(0).max(0.5),
  quoteTimeoutMs: z.number().int().positive(),
  alternativesTopN: z.number().int().positive(),
});

export const parseConfig = (raw: unknown): AppConfig => Schema.parse(raw) as AppConfig;
export const loadConfig = (path: string): AppConfig =>
  parseConfig(JSON.parse(readFileSync(path, "utf8")));
```

### Task 4.2: Routes

- [ ] **Create `collector/test/routes.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { expandRoutes } from "../src/routes.js";

const cfg = {
  chains: [1, 8453, 42161], crossChainOnly: true,
  rateLimitRps: 1, defaultSlippage: 0, quoteTimeoutMs: 1000, alternativesTopN: 20,
  assetPairs: [
    { name: "U", from: "USDC", to: "USDC", sizes: [10, 100] },
    { name: "E", from: "ETH",  to: "ETH",  sizes: [1] },
  ],
};

describe("expandRoutes", () => {
  it("84 total for real config shape", () => {
    const full = {
      ...cfg,
      assetPairs: [
        { name: "A", from: "USDC", to: "USDC", sizes: [10,100,1000,10000] },
        { name: "B", from: "USDT", to: "USDT", sizes: [10,100,1000,10000] },
        { name: "C", from: "ETH",  to: "ETH",  sizes: [0.01,0.1,1] },
        { name: "D", from: "WETH", to: "ETH",  sizes: [0.01,0.1,1] },
      ],
    };
    expect(expandRoutes(full).length).toBe(84);
  });

  it("only cross-chain routes when crossChainOnly=true", () => {
    expect(expandRoutes(cfg).every(r => r.fromChain !== r.toChain)).toBe(true);
  });

  it("filter by pair + size", () => {
    const r = expandRoutes(cfg, { pair: "U", size: 10, fromChain: 1, toChain: 8453 });
    expect(r).toHaveLength(1);
    expect(r[0]!.fromAmountHr).toBe(10);
  });
});
```

- [ ] **Create `collector/src/routes.ts`**

```ts
import type { AppConfig, RouteRequest } from "./types.js";

export interface RouteFilter {
  fromChain?: number;
  toChain?: number;
  pair?: string;
  size?: number;
}

export function expandRoutes(cfg: AppConfig, f: RouteFilter = {}): RouteRequest[] {
  const out: RouteRequest[] = [];
  for (const p of cfg.assetPairs) {
    if (f.pair && f.pair !== p.name) continue;
    for (const fc of cfg.chains) {
      if (f.fromChain && f.fromChain !== fc) continue;
      for (const tc of cfg.chains) {
        if (f.toChain && f.toChain !== tc) continue;
        if (cfg.crossChainOnly && fc === tc) continue;
        for (const s of p.sizes) {
          if (f.size && f.size !== s) continue;
          out.push({ pairName: p.name, fromChain: fc, toChain: tc,
                     fromSymbol: p.from, toSymbol: p.to, fromAmountHr: s });
        }
      }
    }
  }
  return out;
}
```

### Task 4.3: Commit

- [ ] Run all tests and typecheck.
- [ ] Stage + commit:
```bash
git add collector/src/config.ts collector/src/routes.ts collector/test/config.test.ts collector/test/routes.test.ts
```
User runs:
```bash
git commit -m "feat(collector): config loader and route expansion"
```

### Phase 4 verification
- All tests pass. `expandRoutes(loadConfig(...)).length === 84`.

**Pause for user approval before Phase 5.**

---

## Phase 5 — Token resolution (TDD)

**Goal:** `tokens.ts` resolves `(chainId, symbol) → Address` via LI.FI `/tokens`, with in-memory cache.

**Files:** `collector/src/tokens.ts`
**Tests:** `collector/test/tokens.test.ts`

### Task 5.1: Test

- [ ] **Create `collector/test/tokens.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createTokenResolver } from "../src/tokens.js";

const FAKE = {
  tokens: {
    "1": [
      { address: "0x0000000000000000000000000000000000000000", symbol: "ETH",  chainId: 1 },
      { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", chainId: 1 },
      { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", chainId: 1 },
    ],
    "8453": [
      { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", chainId: 8453 },
    ],
  },
};

describe("tokenResolver", () => {
  it("resolves symbol to address", async () => {
    const r = createTokenResolver({ fetcher: async () => FAKE });
    expect(await r.resolve(1, "USDC")).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  });
  it("fetches once across multiple calls", async () => {
    let n = 0;
    const r = createTokenResolver({ fetcher: async () => { n++; return FAKE; } });
    await r.resolve(1, "USDC"); await r.resolve(1, "WETH");
    expect(n).toBe(1);
  });
  it("throws on unknown symbol", async () => {
    const r = createTokenResolver({ fetcher: async () => FAKE });
    await expect(r.resolve(1, "DAI")).rejects.toThrow(/DAI.*chain 1/);
  });
});
```

### Task 5.2: Implementation

- [ ] **Create `collector/src/tokens.ts`**

```ts
import type { Address, ChainId } from "./types.js";

interface LifiToken { address: string; symbol: string; chainId: number; }
type Fetcher = () => Promise<unknown>;

export interface TokenResolver {
  resolve(chainId: ChainId, symbol: string): Promise<Address>;
}

export function createTokenResolver(opts: { fetcher?: Fetcher } = {}): TokenResolver {
  const fetcher = opts.fetcher ?? (async () => {
    const r = await fetch("https://li.quest/v1/tokens");
    if (!r.ok) throw new Error(`/tokens ${r.status}`);
    return r.json();
  });
  let cache: Record<string, LifiToken[]> | null = null;

  return {
    async resolve(chainId, symbol) {
      if (!cache) cache = ((await fetcher()) as { tokens: Record<string, LifiToken[]> }).tokens;
      const list = cache[String(chainId)];
      if (!list) throw new Error(`no tokens for chain ${chainId}`);
      const tok = list.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
      if (!tok) throw new Error(`token ${symbol} not found on chain ${chainId}`);
      return tok.address as Address;
    },
  };
}
```

### Task 5.3: Commit

```bash
git add collector/src/tokens.ts collector/test/tokens.test.ts
```
User runs:
```bash
git commit -m "feat(collector): LI.FI token resolver with cache"
```

### Phase 5 verification
- 3 tests pass. Typecheck clean.

**Pause for user approval before Phase 6.**

---

## Phase 6 — LI.FI wrapper: intent + alternatives + ranking (verification-first, TDD)

**Goal:** `lifi.ts` exposes `fetchIntent()`, `fetchAlternatives()`, and `rankOffers()`. Before writing, run a CLI verification to determine the exact intent subcommand.

**Files:** `collector/src/lifi.ts`
**Tests:** `collector/test/lifi.test.ts` (fixture-based, no network)

### Task 6.1: CLI verification (manual, required before implementation)

- [ ] **Step 1 — Check available CLI commands**

```bash
npx @lifi/cli --help 2>&1
npx @lifi/cli intents --help 2>&1 || true
npx @lifi/cli quote --help 2>&1 || true
```

- [ ] **Step 2 — Run a test intent quote, capture JSON**

Try (adjusting subcommand based on --help output):
```bash
npx @lifi/cli intents quote \
  --from-chain 1 --from-token USDC \
  --to-chain 8453 --to-token USDC \
  --from-amount 10000000 2>&1 | head -c 1000
```

Also try `--json` flag if available. Record whether stdout is clean JSON, mixed output, or requires a flag.

- [ ] **Step 3 — Capture a fixture**

Save a representative intent response to `collector/test/fixtures/intent-response.json`.

- [ ] **Step 4 — Verify alternatives via SDK**

```ts
// quick script: collector/test/fixtures/fetch-fixtures.ts (delete after use)
import { getRoutes } from "@lifi/sdk";
const res = await getRoutes({
  fromChainId: 1, toChainId: 8453,
  fromTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  toTokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  fromAmount: "10000000",
});
console.log(JSON.stringify(res, null, 2));
```

Save a representative response to `collector/test/fixtures/routes-response.json`.

- [ ] **Step 5 — Lock decisions at top of `lifi.ts`**

Write three comments before any code:
```ts
// LIFI_INTENT_CMD:  <exact shell command, e.g. "npx @lifi/cli intents quote">
// LIFI_INTENT_JSON: <flag needed for JSON output, e.g. "--json" or "none">
// LIFI_ALTS_ORDER:  <SDK order param: "RECOMMENDED" | "CHEAPEST" | other>
```

### Task 6.2: Tests

- [ ] **Create `collector/test/lifi.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIntentResponse, parseRoutesResponse, rankOffers } from "../src/lifi.js";
import type { OfferFetchResult } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const intentRaw = readFileSync(join(here, "fixtures/intent-response.json"), "utf8");
const routesRaw = readFileSync(join(here, "fixtures/routes-response.json"), "utf8");

describe("parseIntentResponse", () => {
  it("extracts to_amount and tool from a real fixture", () => {
    const r = parseIntentResponse(intentRaw, 900);
    expect(r.ok).toBe(true);
    expect(r.toAmountHr).toBeGreaterThan(0);
    expect(r.tool).toBeTruthy();
    expect(r.latencyMs).toBe(900);
  });
});

describe("parseRoutesResponse", () => {
  it("returns an array of offers", () => {
    const offers = parseRoutesResponse(routesRaw, 500);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]!.ok).toBe(true);
  });
});

describe("rankOffers", () => {
  const makeOffer = (toAmountHr: number, tool: string): OfferFetchResult => ({
    ok: true, toAmountHr, tool, toAmount: "0",
    rawJson: "{}", latencyMs: 100,
  });

  it("rank 1 = highest to_amount", () => {
    const ranked = rankOffers(
      makeOffer(999, "across"),
      [makeOffer(1000, "stargate"), makeOffer(998, "hop")]
    );
    // intent has 999; best is 1000 (stargate)
    expect(ranked.intentRank).toBe(2);
    expect(ranked.delta_hr).toBeCloseTo(1);
    expect(ranked.delta_bps).toBeCloseTo(10);
  });

  it("intent rank=1 when it has the best output", () => {
    const ranked = rankOffers(
      makeOffer(1001, "intent-solver"),
      [makeOffer(999, "hop"), makeOffer(998, "connext")]
    );
    expect(ranked.intentRank).toBe(1);
    expect(ranked.delta_hr).toBeCloseTo(0);
    expect(ranked.delta_bps).toBeCloseTo(0);
  });

  it("handles empty alternatives", () => {
    const ranked = rankOffers(makeOffer(500, "solver"), []);
    expect(ranked.intentRank).toBe(1);
    expect(ranked.allOffers).toHaveLength(1);
  });
});
```

### Task 6.3: Implementation

- [ ] **Create `collector/src/lifi.ts`**

```ts
// LIFI_INTENT_CMD:  <fill in after Phase 6.1>
// LIFI_INTENT_JSON: <fill in>
// LIFI_ALTS_ORDER:  <fill in>
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getRoutes } from "@lifi/sdk";
import type { OfferFetchResult, RouteRequest, Address } from "./types.js";
import type { TokenResolver } from "./tokens.js";

const execFileAsync = promisify(execFile);

function guessDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === "USDC" || s === "USDT") return 6;
  if (s === "ETH" || s === "WETH") return 18;
  throw new Error(`decimals unknown for symbol: ${symbol}`);
}

// ── Intent (CLI) ───────────────────────────────────────────────

export function parseIntentResponse(raw: string, latencyMs: number): OfferFetchResult {
  try {
    const j = JSON.parse(raw);
    // Exact field path depends on CLI output — adjust after Phase 6.1 verification.
    const estimate = j.estimate ?? j;
    const decimals = estimate.toToken?.decimals ?? 6;
    const toAmountHr = estimate.toAmount
      ? Number(estimate.toAmount) / 10 ** decimals
      : undefined;
    return {
      ok: true,
      toAmount: String(estimate.toAmount ?? ""),
      toAmountHr,
      toAmountUsd: estimate.toAmountUSD ? Number(estimate.toAmountUSD) : undefined,
      gasCostUsd: Array.isArray(estimate.gasCosts)
        ? estimate.gasCosts.reduce((s: number, g: any) => s + Number(g.amountUSD ?? 0), 0)
        : undefined,
      feeUsd: Array.isArray(estimate.feeCosts)
        ? estimate.feeCosts.reduce((s: number, f: any) => s + Number(f.amountUSD ?? 0), 0)
        : undefined,
      tool: j.tool ?? j.toolDetails?.key,
      rawJson: raw,
      latencyMs,
    };
  } catch (e: any) {
    return { ok: false, errorMessage: `parse error: ${e.message}`, rawJson: raw, latencyMs };
  }
}

export async function fetchIntent(
  req: RouteRequest,
  resolver: TokenResolver,
  opts: { slippage: number; timeoutMs: number }
): Promise<OfferFetchResult> {
  const fromToken = await resolver.resolve(req.fromChain, req.fromSymbol);
  const toToken = await resolver.resolve(req.toChain, req.toSymbol);
  const dec = guessDecimals(req.fromSymbol);
  const fromAmount = BigInt(Math.round(req.fromAmountHr * 10 ** dec)).toString();

  const t0 = Date.now();
  // ADJUST: replace "intents" and flags with verified values from Phase 6.1
  const args = [
    "@lifi/cli", "intents", "quote",
    "--from-chain", String(req.fromChain),
    "--from-token", fromToken,
    "--to-chain", String(req.toChain),
    "--to-token", toToken,
    "--from-amount", fromAmount,
    "--json",
  ];

  try {
    const { stdout } = await Promise.race([
      execFileAsync("npx", args, { timeout: opts.timeoutMs }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("intent timeout")), opts.timeoutMs)
      ),
    ]);
    return parseIntentResponse(stdout, Date.now() - t0);
  } catch (e: any) {
    return { ok: false, errorMessage: e.message, rawJson: JSON.stringify({ error: e.message }), latencyMs: Date.now() - t0 };
  }
}

// ── Alternatives (SDK) ─────────────────────────────────────────

export function parseRoutesResponse(raw: string, latencyMs: number): OfferFetchResult[] {
  try {
    const data = JSON.parse(raw);
    const routes: any[] = data.routes ?? [];
    return routes.map(r => {
      const est = r.steps?.[0]?.estimate ?? r.estimate ?? {};
      const dec = est.toToken?.decimals ?? 6;
      const toAmountHr = est.toAmount ? Number(est.toAmount) / 10 ** dec : undefined;
      return {
        ok: true,
        toAmount: String(est.toAmount ?? ""),
        toAmountHr,
        toAmountUsd: est.toAmountUSD ? Number(est.toAmountUSD) : undefined,
        gasCostUsd: Number(r.gasCostUSD ?? 0),
        feeUsd: Number(r.feeCosts?.[0]?.amountUSD ?? 0),
        tool: r.steps?.[0]?.tool,
        rawJson: JSON.stringify(r),
        latencyMs,
      };
    });
  } catch (e: any) {
    return [{ ok: false, errorMessage: `parse error: ${e.message}`, rawJson: raw, latencyMs }];
  }
}

export async function fetchAlternatives(
  req: RouteRequest,
  resolver: TokenResolver,
  opts: { slippage: number; timeoutMs: number; topN: number }
): Promise<OfferFetchResult[]> {
  const fromToken = await resolver.resolve(req.fromChain, req.fromSymbol);
  const toToken = await resolver.resolve(req.toChain, req.toSymbol);
  const dec = guessDecimals(req.fromSymbol);
  const fromAmount = BigInt(Math.round(req.fromAmountHr * 10 ** dec)).toString();

  const t0 = Date.now();
  try {
    const result = await Promise.race([
      getRoutes({
        fromChainId: req.fromChain,
        toChainId: req.toChain,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount,
        options: { slippage: opts.slippage, order: "RECOMMENDED" as any },
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("alts timeout")), opts.timeoutMs)
      ),
    ]);
    const raw = JSON.stringify(result);
    const latencyMs = Date.now() - t0;
    return parseRoutesResponse(raw, latencyMs)
      .filter(o => o.ok)
      .sort((a, b) => (b.toAmountHr ?? 0) - (a.toAmountHr ?? 0))
      .slice(0, opts.topN);
  } catch (e: any) {
    return [{ ok: false, errorMessage: e.message, rawJson: JSON.stringify({ error: e.message }), latencyMs: Date.now() - t0 }];
  }
}

// ── Ranking ────────────────────────────────────────────────────

export interface RankResult {
  intentRank: number;
  best_to_amount_hr: number;
  delta_hr: number;
  delta_bps: number;
  allOffers: Array<{ source: "intent" | "routes"; rank: number; result: OfferFetchResult }>;
}

export function rankOffers(
  intent: OfferFetchResult,
  alternatives: OfferFetchResult[]
): RankResult {
  const combined = [
    { source: "intent" as const, result: intent },
    ...alternatives.map(r => ({ source: "routes" as const, result: r })),
  ];

  // Sort by to_amount_hr desc, then fee_usd asc, then tool asc (stable tie-break)
  const sorted = [...combined].sort((a, b) => {
    const diff = (b.result.toAmountHr ?? 0) - (a.result.toAmountHr ?? 0);
    if (diff !== 0) return diff;
    const feeDiff = (a.result.feeUsd ?? 0) - (b.result.feeUsd ?? 0);
    if (feeDiff !== 0) return feeDiff;
    return (a.result.tool ?? "").localeCompare(b.result.tool ?? "");
  });

  const allOffers = sorted.map((entry, i) => ({ ...entry, rank: i + 1 }));
  const intentEntry = allOffers.find(e => e.source === "intent")!;
  const best = sorted[0]!.result.toAmountHr ?? 0;
  const intentAmt = intent.toAmountHr ?? 0;
  const delta_hr = best - intentAmt;
  const delta_bps = best > 0 ? (delta_hr / best) * 10000 : 0;

  return {
    intentRank: intentEntry.rank,
    best_to_amount_hr: best,
    delta_hr,
    delta_bps,
    allOffers,
  };
}
```

- [ ] Run: `pnpm --filter collector test` — expect all passing.
- [ ] **Live smoke (manual)**:
```bash
pnpm --filter collector exec tsx -e "
import('./src/lifi.js').then(async lifi => {
  const {createTokenResolver} = await import('./src/tokens.js');
  const r = createTokenResolver();
  const req = {pairName:'USDC-USDC',fromChain:1,toChain:8453,fromSymbol:'USDC',toSymbol:'USDC',fromAmountHr:10};
  const opts = {slippage:0.005, timeoutMs:30000};
  const intent = await lifi.fetchIntent(req, r, opts);
  const alts = await lifi.fetchAlternatives(req, r, {...opts, topN:5});
  const ranked = lifi.rankOffers(intent, alts);
  console.log('intent rank:', ranked.intentRank, '/ delta_bps:', ranked.delta_bps.toFixed(1));
})"
```

### Task 6.4: Commit

```bash
git add collector/src/lifi.ts collector/test/lifi.test.ts \
  collector/test/fixtures/intent-response.json collector/test/fixtures/routes-response.json
```
User runs:
```bash
git commit -m "feat(collector): intent + alternatives fetcher and ranking"
```

### Phase 6 verification
- Unit tests pass. Live smoke prints `intent rank: N / delta_bps: X.X`.

**Pause for user approval before Phase 7.**

---

## Phase 7 — Run loop + entry points

**Goal:** `runner.ts` iterates requests, makes two LI.FI calls each, ranks, inserts via transaction. `daily.ts` + `adhoc.ts` wire it up.

**Files:** `collector/src/runner.ts`, `collector/src/daily.ts`, `collector/src/adhoc.ts`
**Tests:** `collector/test/runner.test.ts`

### Task 7.1: Runner test

- [ ] **Create `collector/test/runner.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMatrix } from "../src/runner.js";
import { openDb } from "../src/db.js";
import type { RouteRequest, OfferFetchResult } from "../src/types.js";

const ADDR = "0x0000000000000000000000000000000000000001" as const;
const okOffer = (hr: number, tool: string): OfferFetchResult =>
  ({ ok: true, toAmountHr: hr, toAmount: String(hr * 1e6), tool, rawJson: "{}", latencyMs: 10 });

describe("runMatrix", () => {
  it("inserts one request + multiple offers per route", async () => {
    const dir = mkdtempSync(join(tmpdir(), "runner-"));
    const db = openDb(join(dir, "q.db"));
    const routes: RouteRequest[] = [
      { pairName: "U", fromChain: 1, toChain: 8453, fromSymbol: "USDC", toSymbol: "USDC", fromAmountHr: 10 },
    ];

    const summary = await runMatrix({
      db, routes, runKind: "daily", rateLimitRps: 1000,
      resolveToken: async () => ADDR,
      fetchIntent: async () => okOffer(9.9, "solver"),
      fetchAlternatives: async () => [okOffer(10.0, "stargate"), okOffer(9.8, "hop")],
    });

    expect(summary.ok).toBe(1);
    const req = db.prepare("SELECT * FROM requests LIMIT 1").get() as any;
    expect(req.intent_rank).toBe(2);        // solver(9.9) loses to stargate(10.0)
    expect(req.alt_count).toBe(2);
    const offers = db.prepare("SELECT * FROM offers").all() as any[];
    expect(offers).toHaveLength(3);         // 1 intent + 2 alternatives
    rmSync(dir, { recursive: true, force: true });
  });

  it("records partial status when intent fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "runner-partial-"));
    const db = openDb(join(dir, "q.db"));
    const routes: RouteRequest[] = [
      { pairName: "U", fromChain: 1, toChain: 8453, fromSymbol: "USDC", toSymbol: "USDC", fromAmountHr: 10 },
    ];
    await runMatrix({
      db, routes, runKind: "adhoc", rateLimitRps: 1000,
      resolveToken: async () => ADDR,
      fetchIntent: async () => ({ ok: false, errorMessage: "timeout", rawJson: "{}", latencyMs: 5 }),
      fetchAlternatives: async () => [okOffer(10.0, "stargate")],
    });
    const req = db.prepare("SELECT * FROM requests LIMIT 1").get() as any;
    expect(req.status).toBe("partial");
    expect(req.intent_rank).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
```

### Task 7.2: Runner implementation

- [ ] **Create `collector/src/runner.ts`**

```ts
import { ulid } from "ulid";
import type { Database as DB } from "better-sqlite3";
import type { RouteRequest, OfferFetchResult, RunKind, OfferRow, RequestRow, Address, ChainId } from "./types.js";
import { insertRequestWithOffers } from "./db.js";
import { rankOffers } from "./lifi.js";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface RunMatrixOpts {
  db: DB;
  routes: RouteRequest[];
  runKind: RunKind;
  rateLimitRps: number;
  resolveToken: (chainId: ChainId, symbol: string) => Promise<Address>;
  fetchIntent: (r: RouteRequest) => Promise<OfferFetchResult>;
  fetchAlternatives: (r: RouteRequest) => Promise<OfferFetchResult[]>;
  topN?: number;
  onProgress?: (done: number, total: number) => void;
}

export interface RunSummary { runId: string; ok: number; partial: number; err: number; wallMs: number; }

export async function runMatrix(opts: RunMatrixOpts): Promise<RunSummary> {
  const runId = ulid();
  const t0 = Date.now();
  const delay = 1000 / Math.max(opts.rateLimitRps, 0.001);
  let ok = 0, partial = 0, err = 0;

  for (let i = 0; i < opts.routes.length; i++) {
    const r = opts.routes[i]!;
    const ts = Date.now();
    const [fromToken, toToken] = await Promise.all([
      opts.resolveToken(r.fromChain, r.fromSymbol),
      opts.resolveToken(r.toChain, r.toSymbol),
    ]);
    const dec = r.fromSymbol.toUpperCase().startsWith("USD") ? 6 : 18;
    const fromAmount = BigInt(Math.round(r.fromAmountHr * 10 ** dec)).toString();

    const [intentResult, altsResult] = await Promise.all([
      opts.fetchIntent(r),
      opts.fetchAlternatives(r),
    ]);

    const intentOk = intentResult.ok;
    const altsOk = altsResult.some(a => a.ok);
    const status = intentOk && altsOk ? "ok"
                 : !intentOk && !altsOk ? "error"
                 : "partial";

    let intentRank: number | null = null;
    let bestAmt: number | null = null;
    let intentAmt: number | null = null;
    let deltaHr: number | null = null;
    let deltaBps: number | null = null;
    const offerRows: Omit<OfferRow, "request_id">[] = [];

    if (intentOk || altsOk) {
      const goodAlts = altsResult.filter(a => a.ok);
      if (intentOk && goodAlts.length > 0) {
        const ranked = rankOffers(intentResult, goodAlts);
        intentRank = ranked.intentRank;
        bestAmt = ranked.best_to_amount_hr;
        intentAmt = intentResult.toAmountHr ?? null;
        deltaHr = ranked.delta_hr;
        deltaBps = ranked.delta_bps;
        for (const entry of ranked.allOffers) {
          offerRows.push({
            source: entry.source, rank_by_to_amount: entry.rank,
            tool: entry.result.tool ?? null,
            to_amount: entry.result.toAmount ?? null,
            to_amount_hr: entry.result.toAmountHr ?? null,
            to_amount_usd: entry.result.toAmountUsd ?? null,
            gas_cost_usd: entry.result.gasCostUsd ?? null,
            fee_usd: entry.result.feeUsd ?? null,
            effective_rate: entry.result.toAmountHr
              ? entry.result.toAmountHr / r.fromAmountHr : null,
            raw_json: entry.result.rawJson,
          });
        }
      } else {
        // partial: store whichever side succeeded
        if (intentOk) {
          offerRows.push({ source: "intent", rank_by_to_amount: null, tool: intentResult.tool ?? null,
            to_amount: intentResult.toAmount ?? null, to_amount_hr: intentResult.toAmountHr ?? null,
            to_amount_usd: intentResult.toAmountUsd ?? null, gas_cost_usd: intentResult.gasCostUsd ?? null,
            fee_usd: intentResult.feeUsd ?? null, effective_rate: intentResult.toAmountHr
              ? intentResult.toAmountHr / r.fromAmountHr : null, raw_json: intentResult.rawJson });
        }
        for (const alt of goodAlts) {
          offerRows.push({ source: "routes", rank_by_to_amount: null, tool: alt.tool ?? null,
            to_amount: alt.toAmount ?? null, to_amount_hr: alt.toAmountHr ?? null,
            to_amount_usd: alt.toAmountUsd ?? null, gas_cost_usd: alt.gasCostUsd ?? null,
            fee_usd: alt.feeUsd ?? null, effective_rate: alt.toAmountHr
              ? alt.toAmountHr / r.fromAmountHr : null, raw_json: alt.rawJson });
        }
      }
    }

    const req: RequestRow = {
      run_id: runId, run_kind: opts.runKind, ts,
      from_chain: r.fromChain, to_chain: r.toChain, pair_name: r.pairName,
      from_symbol: r.fromSymbol, to_symbol: r.toSymbol,
      from_token: fromToken, to_token: toToken,
      from_amount: fromAmount, from_amount_hr: r.fromAmountHr,
      intent_rank: intentRank,
      best_to_amount_hr: bestAmt,
      intent_to_amount_hr: intentAmt,
      delta_hr: deltaHr, delta_bps: deltaBps,
      alt_count: altsResult.filter(a => a.ok).length,
      latency_intent_ms: intentResult.latencyMs,
      latency_alts_ms: Math.max(...altsResult.map(a => a.latencyMs), 0),
      status,
      error_message: status === "error"
        ? [intentResult.errorMessage, altsResult[0]?.errorMessage].filter(Boolean).join("; ")
        : null,
    };

    insertRequestWithOffers(opts.db, req, offerRows.map(o => ({ ...o, request_id: 0 })));
    if (status === "ok") ok++;
    else if (status === "partial") partial++;
    else err++;

    opts.onProgress?.(i + 1, opts.routes.length);
    if (i < opts.routes.length - 1) await sleep(delay);
  }

  return { runId, ok, partial, err, wallMs: Date.now() - t0 };
}
```

### Task 7.3: Entry points

- [ ] **Create `collector/src/daily.ts`**

```ts
import { loadConfig } from "./config.js";
import { expandRoutes } from "./routes.js";
import { openDb } from "./db.js";
import { createTokenResolver } from "./tokens.js";
import { fetchIntent, fetchAlternatives } from "./lifi.js";
import { runMatrix } from "./runner.js";

const cfg = loadConfig(new URL("../../config.json", import.meta.url).pathname);
const db = openDb(new URL("../../db/quotes.db", import.meta.url).pathname);
const resolver = createTokenResolver();
const routes = expandRoutes(cfg);
const opts = { slippage: cfg.defaultSlippage, timeoutMs: cfg.quoteTimeoutMs };

console.log(`daily run: ${routes.length} requests × 2 calls each`);
const summary = await runMatrix({
  db, routes, runKind: "daily", rateLimitRps: cfg.rateLimitRps,
  resolveToken: (c, s) => resolver.resolve(c, s),
  fetchIntent: r => fetchIntent(r, resolver, opts),
  fetchAlternatives: r => fetchAlternatives(r, resolver, { ...opts, topN: cfg.alternativesTopN }),
  onProgress: (d, t) => process.stdout.write(`\r${d}/${t}`),
});
console.log(`\n${summary.runId}: ok=${summary.ok} partial=${summary.partial} err=${summary.err} ${summary.wallMs}ms`);
```

- [ ] **Create `collector/src/adhoc.ts`**

```ts
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { expandRoutes } from "./routes.js";
import { openDb } from "./db.js";
import { createTokenResolver } from "./tokens.js";
import { fetchIntent, fetchAlternatives } from "./lifi.js";
import { runMatrix } from "./runner.js";
import type { RouteFilter } from "./routes.js";

const program = new Command()
  .option("--from-chain <n>", "source chainId", v => Number(v))
  .option("--to-chain <n>",   "dest chainId",   v => Number(v))
  .option("--pair <name>",    "asset pair name (e.g. USDC-USDC)")
  .option("--size <n>",       "human-readable size", v => Number(v))
  .parse();

const opts = program.opts<RouteFilter>();
const cfg = loadConfig(new URL("../../config.json", import.meta.url).pathname);
const routes = expandRoutes(cfg, opts);
if (routes.length === 0) { console.error("no routes match those filters"); process.exit(2); }

const db = openDb(new URL("../../db/quotes.db", import.meta.url).pathname);
const resolver = createTokenResolver();
const callOpts = { slippage: cfg.defaultSlippage, timeoutMs: cfg.quoteTimeoutMs };

console.log(`adhoc run: ${routes.length} requests`);
const summary = await runMatrix({
  db, routes, runKind: "adhoc", rateLimitRps: cfg.rateLimitRps,
  resolveToken: (c, s) => resolver.resolve(c, s),
  fetchIntent: r => fetchIntent(r, resolver, callOpts),
  fetchAlternatives: r => fetchAlternatives(r, resolver, { ...callOpts, topN: cfg.alternativesTopN }),
  onProgress: (d, t) => process.stdout.write(`\r${d}/${t}`),
});
console.log(`\n${summary.runId}: ok=${summary.ok} partial=${summary.partial} err=${summary.err} ${summary.wallMs}ms`);
```

- [ ] **Live smoke**:
```bash
pnpm pull:adhoc -- --pair USDC-USDC --from-chain 1 --to-chain 8453 --size 10
```
Expected: prints rank + delta in the run summary, rows appear in `db/quotes.db`.

### Task 7.4: Commit

```bash
git add collector/src/runner.ts collector/src/daily.ts collector/src/adhoc.ts collector/test/runner.test.ts
```
User runs:
```bash
git commit -m "feat(collector): run loop with two-call-per-request and ranking"
```

### Phase 7 verification
- Runner tests pass. Adhoc smoke inserts requests + offers. Typecheck clean.

**Pause for user approval before Phase 8.**

---

## Phase 8 — Server (Hono)

**Goal:** Read-only API over `requests` + `offers` join queries. Snapshot and timeseries return rank/delta info.

**Files:** `server/package.json`, `server/tsconfig.json`, `server/src/index.ts`, `server/src/handlers.ts`
**Tests:** `server/test/handlers.test.ts`

### Task 8.1: Scaffold

- [ ] **Create `server/package.json`**

```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "better-sqlite3": "^11.3.0",
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Create `server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] Run: `pnpm install`

### Task 8.2: Handlers (TDD)

- [ ] **Create `server/test/handlers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "../src/handlers.js";

function seededDb() {
  const db = new Database(":memory:");
  db.exec(readFileSync(join(process.cwd(), "db/schema.sql"), "utf8"));
  db.pragma("foreign_keys = ON");

  const insertReq = db.prepare(`INSERT INTO requests
    (run_id,run_kind,ts,from_chain,to_chain,pair_name,from_symbol,to_symbol,
     from_token,to_token,from_amount,from_amount_hr,intent_rank,best_to_amount_hr,
     intent_to_amount_hr,delta_hr,delta_bps,alt_count,latency_intent_ms,
     latency_alts_ms,status,error_message)
    VALUES (@run_id,@run_kind,@ts,@from_chain,@to_chain,@pair_name,@from_symbol,@to_symbol,
     @from_token,@to_token,@from_amount,@from_amount_hr,@intent_rank,@best_to_amount_hr,
     @intent_to_amount_hr,@delta_hr,@delta_bps,@alt_count,@latency_intent_ms,
     @latency_alts_ms,@status,@error_message)
    RETURNING id`);

  const insertOffer = db.prepare(`INSERT INTO offers
    (request_id,source,rank_by_to_amount,tool,to_amount,to_amount_hr,
     to_amount_usd,gas_cost_usd,fee_usd,effective_rate,raw_json)
    VALUES (@request_id,@source,@rank_by_to_amount,@tool,@to_amount,@to_amount_hr,
     @to_amount_usd,@gas_cost_usd,@fee_usd,@effective_rate,@raw_json)`);

  const baseReq = {
    run_kind: "daily", from_chain: 1, to_chain: 8453, pair_name: "USDC-USDC",
    from_symbol: "USDC", to_symbol: "USDC", from_token: "0x1", to_token: "0x2",
    from_amount: "10000000", from_amount_hr: 10, alt_count: 1,
    latency_intent_ms: 400, latency_alts_ms: 600, error_message: null,
  };

  const r1 = (insertReq.get({ ...baseReq, run_id: "r1", ts: 100,
    intent_rank: 2, best_to_amount_hr: 10.0, intent_to_amount_hr: 9.9,
    delta_hr: 0.1, delta_bps: 100, status: "ok" }) as any).id;
  const r2 = (insertReq.get({ ...baseReq, run_id: "r2", ts: 200,
    intent_rank: 1, best_to_amount_hr: 10.0, intent_to_amount_hr: 10.0,
    delta_hr: 0.0, delta_bps: 0, status: "ok" }) as any).id;

  const baseOffer = { to_amount: "10000000", to_amount_usd: 10, gas_cost_usd: 0.1,
    fee_usd: 0.05, effective_rate: 1.0, raw_json: "{}" };
  insertOffer.run({ ...baseOffer, request_id: r1, source: "intent", rank_by_to_amount: 2,
    tool: "solver", to_amount_hr: 9.9 });
  insertOffer.run({ ...baseOffer, request_id: r1, source: "routes", rank_by_to_amount: 1,
    tool: "stargate", to_amount_hr: 10.0 });
  insertOffer.run({ ...baseOffer, request_id: r2, source: "intent", rank_by_to_amount: 1,
    tool: "solver", to_amount_hr: 10.0 });

  return db;
}

describe("handlers", () => {
  it("GET /api/runs returns most recent first", async () => {
    const { runs } = await buildApp(seededDb()).request("/api/runs").then(r => r.json());
    expect(runs[0].run_id).toBe("r2");
  });

  it("GET /api/snapshot defaults to latest daily run with rank info", async () => {
    const { rows } = await buildApp(seededDb()).request("/api/snapshot").then(r => r.json());
    expect(rows[0].run_id).toBe("r2");
    expect(rows[0].intent_rank).toBe(1);
    expect(rows[0].delta_bps).toBe(0);
  });

  it("GET /api/timeseries returns points with delta_bps and intent_rank", async () => {
    const { points } = await buildApp(seededDb())
      .request("/api/timeseries?pair=USDC-USDC&from=1&to=8453&size=10")
      .then(r => r.json());
    expect(points).toHaveLength(2);
    expect(points[0].intent_rank).toBe(2);
    expect(points[1].intent_rank).toBe(1);
  });
});
```

- [ ] **Create `server/src/handlers.ts`**

```ts
import { Hono } from "hono";
import type { Database as DB } from "better-sqlite3";

export function buildApp(db: DB) {
  const app = new Hono();

  app.get("/api/runs", c => {
    const limit = Number(c.req.query("limit") ?? 30);
    const runs = db.prepare(
      `SELECT run_id, run_kind, MAX(ts) AS ts,
         SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok_count,
         SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) AS partial_count,
         SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS err_count
       FROM requests GROUP BY run_id ORDER BY ts DESC LIMIT ?`
    ).all(limit);
    return c.json({ runs });
  });

  app.get("/api/snapshot", c => {
    const runId = c.req.query("run_id") ?? (db.prepare(
      `SELECT run_id FROM requests WHERE run_kind='daily'
       GROUP BY run_id ORDER BY MAX(ts) DESC LIMIT 1`
    ).get() as { run_id?: string } | undefined)?.run_id;
    if (!runId) return c.json({ rows: [] });
    const rows = db.prepare(
      `SELECT r.*, o.tool AS best_tool
       FROM requests r
       LEFT JOIN offers o ON o.request_id = r.id AND o.rank_by_to_amount = 1 AND o.source = 'routes'
       WHERE r.run_id = ?
       ORDER BY r.pair_name, r.from_chain, r.to_chain, r.from_amount_hr`
    ).all(runId);
    return c.json({ runId, rows });
  });

  app.get("/api/routes", c => {
    const routes = db.prepare(
      `SELECT DISTINCT pair_name, from_chain, to_chain, from_amount_hr
       FROM requests ORDER BY pair_name, from_chain, to_chain, from_amount_hr`
    ).all();
    return c.json({ routes });
  });

  app.get("/api/timeseries", c => {
    const pair = c.req.query("pair");
    const from = Number(c.req.query("from"));
    const to = Number(c.req.query("to"));
    const size = Number(c.req.query("size"));
    if (!pair || !from || !to || !size) return c.json({ error: "missing params" }, 400);

    const points = db.prepare(
      `SELECT r.ts, r.intent_rank, r.intent_to_amount_hr, r.best_to_amount_hr,
              r.delta_hr, r.delta_bps, r.status,
              intent_o.tool AS intent_tool,
              best_o.tool AS best_tool
       FROM requests r
       LEFT JOIN offers intent_o ON intent_o.request_id = r.id AND intent_o.source = 'intent'
       LEFT JOIN offers best_o   ON best_o.request_id   = r.id AND best_o.source = 'routes'
                                 AND best_o.rank_by_to_amount = 1
       WHERE r.pair_name = ? AND r.from_chain = ? AND r.to_chain = ? AND r.from_amount_hr = ?
       ORDER BY r.ts ASC`
    ).all(pair, from, to, size);
    return c.json({ points });
  });

  app.get("/api/request/:id/offers", c => {
    const id = Number(c.req.param("id"));
    const offers = db.prepare(
      `SELECT * FROM offers WHERE request_id = ? ORDER BY rank_by_to_amount ASC NULLS LAST`
    ).all(id);
    return c.json({ offers });
  });

  return app;
}
```

- [ ] **Create `server/src/index.ts`**

```ts
import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { buildApp } from "./handlers.js";

const dbPath = new URL("../../db/quotes.db", import.meta.url).pathname;
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const app = buildApp(db);
const PORT = Number(process.env.PORT ?? 5174);
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: PORT }, i =>
  console.log(`server: http://127.0.0.1:${i.port}`)
);
```

### Task 8.3: Commit

```bash
git add server/package.json server/tsconfig.json server/src/index.ts server/src/handlers.ts server/test/handlers.test.ts pnpm-lock.yaml
```
User runs:
```bash
git commit -m "feat(server): read-only API with intent rank + delta in snapshot and timeseries"
```

### Phase 8 verification
- `pnpm --filter server test` passes.
- `curl http://127.0.0.1:5174/api/snapshot` returns rows with `intent_rank` + `delta_bps`.

**Pause for user approval before Phase 9.**

---

## Phase 9 — Web scaffold (Vite + React)

**Goal:** Vite+React workspace scaffolded with routing. Pages stubbed.

**Files:** `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/tsconfig.json`

### Task 9.1: Create files

- [ ] **`web/package.json`**

```json
{
  "name": "web",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "react": "^18.3.0", "react-dom": "^18.3.0",
    "react-router-dom": "^6.27.0", "recharts": "^2.13.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0", "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0", "typescript": "^5.6.0", "vite": "^5.4.0"
  }
}
```

- [ ] **`web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:5174" } },
});
```

- [ ] **`web/index.html`**

```html
<!doctype html><html><head><meta charset="utf-8"><title>LI.FI Quote Tracker</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
```

- [ ] **`web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022","DOM"], "types": ["vite/client"] },
  "include": ["src/**/*","vite.config.ts"]
}
```

- [ ] **`web/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>
);
```

- [ ] **`web/src/App.tsx`** (stubs)

```tsx
import { Routes, Route, Link } from "react-router-dom";
function Snapshot() { return <div>Snapshot (Phase 10)</div>; }
function Timeseries() { return <div>Timeseries (Phase 11)</div>; }
export default function App() {
  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <Link to="/">Snapshot</Link><Link to="/route">Route</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Snapshot />} />
        <Route path="/route" element={<Timeseries />} />
      </Routes>
    </div>
  );
}
```

### Task 9.2: Install + smoke

- [ ] `pnpm install` → `pnpm web` → open `http://localhost:5173`, see stubbed nav.

### Task 9.3: Commit

```bash
git add web/package.json web/vite.config.ts web/index.html web/tsconfig.json web/src/main.tsx web/src/App.tsx pnpm-lock.yaml
```
User runs:
```bash
git commit -m "feat(web): scaffold Vite+React app with routing"
```

### Phase 9 verification
- Dev server renders shell with nav. `pnpm --filter web typecheck` clean.

**Pause for user approval before Phase 10.**

---

## Phase 10 — Snapshot page

**Goal:** `Snapshot.tsx` shows the latest-daily-run as a table with intent rank (colour-coded), delta bps, intent tool, best tool, and a `chart →` link per row.

**Files:** `web/src/api.ts`, `web/src/pages/Snapshot.tsx`
**Modify:** `web/src/App.tsx`

### Task 10.1: API types + helper

- [ ] **Create `web/src/api.ts`**

```ts
export interface SnapshotRowDTO {
  id: number; run_id: string; run_kind: "daily"|"adhoc"; ts: number;
  pair_name: string; from_chain: number; to_chain: number;
  from_amount_hr: number;
  intent_rank: number | null; best_to_amount_hr: number | null;
  intent_to_amount_hr: number | null; delta_hr: number | null;
  delta_bps: number | null; alt_count: number; status: string;
  intent_tool?: string; best_tool?: string;
}
export interface RunDTO {
  run_id: string; run_kind: string; ts: number;
  ok_count: number; partial_count: number; err_count: number;
}
export interface TimeseriesPoint {
  ts: number; intent_rank: number|null; intent_to_amount_hr: number|null;
  best_to_amount_hr: number|null; delta_bps: number|null;
  intent_tool: string|null; best_tool: string|null; status: string;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export const api = {
  runs: () => get<{ runs: RunDTO[] }>("/api/runs"),
  snapshot: (runId?: string) =>
    get<{ runId: string; rows: SnapshotRowDTO[] }>(
      runId ? `/api/snapshot?run_id=${encodeURIComponent(runId)}` : "/api/snapshot"
    ),
  timeseries: (p: { pair: string; from: number; to: number; size: number }) =>
    get<{ points: TimeseriesPoint[] }>(
      `/api/timeseries?pair=${encodeURIComponent(p.pair)}&from=${p.from}&to=${p.to}&size=${p.size}`
    ),
  routes: () =>
    get<{ routes: Array<{ pair_name: string; from_chain: number; to_chain: number; from_amount_hr: number }> }>("/api/routes"),
};
```

### Task 10.2: Snapshot page

- [ ] **Create `web/src/pages/Snapshot.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SnapshotRowDTO, type RunDTO } from "../api.js";

function rankColor(rank: number | null): string {
  if (rank === null) return "#999";
  if (rank === 1) return "#16a34a";
  if (rank <= 3) return "#d97706";
  return "#dc2626";
}

export default function Snapshot() {
  const [runs, setRuns] = useState<RunDTO[]>([]);
  const [runId, setRunId] = useState<string | undefined>();
  const [rows, setRows] = useState<SnapshotRowDTO[]>([]);

  useEffect(() => { api.runs().then(r => setRuns(r.runs)); }, []);
  useEffect(() => {
    api.snapshot(runId).then(s => { setRows(s.rows); setRunId(s.runId); });
  }, [runId]);

  return (
    <div>
      <label>
        Run:{" "}
        <select value={runId ?? ""} onChange={e => setRunId(e.target.value)}>
          {runs.map(r => (
            <option key={r.run_id} value={r.run_id}>
              {new Date(r.ts).toISOString().slice(0, 16)} — {r.run_kind}
              {" "}({r.ok_count}ok/{r.partial_count}p/{r.err_count}err)
            </option>
          ))}
        </select>
      </label>
      <table style={{ marginTop: 12, borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th>Pair</th><th>From</th><th>To</th><th>Size</th>
            <th>Rank</th><th>Δ bps</th><th>Intent tool</th><th>Best tool</th>
            <th>Alt #</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid #eee" }}>
              <td>{r.pair_name}</td>
              <td>{r.from_chain}</td>
              <td>{r.to_chain}</td>
              <td>{r.from_amount_hr}</td>
              <td style={{ color: rankColor(r.intent_rank), fontWeight: 700 }}>
                {r.intent_rank != null ? `#${r.intent_rank}` : "—"}
              </td>
              <td>{r.delta_bps != null ? r.delta_bps.toFixed(1) : "—"}</td>
              <td>{r.intent_tool ?? "—"}</td>
              <td>{r.best_tool ?? "—"}</td>
              <td>{r.alt_count}</td>
              <td>{r.status}</td>
              <td>
                <Link to={`/route?pair=${encodeURIComponent(r.pair_name)}&from=${r.from_chain}&to=${r.to_chain}&size=${r.from_amount_hr}`}>
                  chart →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Task 10.3: Wire into App

- [ ] Re-read `web/src/App.tsx`. Replace stub import:

```tsx
import Snapshot from "./pages/Snapshot.js";
```

- [ ] Open browser, confirm snapshot table shows `#1`/`#2` etc. in rank column, colored green/amber/red.

### Task 10.4: Commit

```bash
git add web/src/api.ts web/src/pages/Snapshot.tsx web/src/App.tsx
```
User runs:
```bash
git commit -m "feat(web): snapshot page with intent rank and delta_bps"
```

### Phase 10 verification
- Browser renders snapshot with real data; rank column color-coded.

**Pause for user approval before Phase 11.**

---

## Phase 11 — Timeseries page + size selector

**Goal:** Two charts — output amount (intent vs best, two lines) and intent rank (step line). Size selector pulls available sizes from `/api/routes`.

**Files:** `web/src/components/SizeSelector.tsx`, `web/src/pages/Timeseries.tsx`
**Modify:** `web/src/App.tsx`

### Task 11.1: SizeSelector

- [ ] **Create `web/src/components/SizeSelector.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "../api.js";

export function SizeSelector(props: {
  pair: string; fromChain: number; toChain: number;
  current: number; onChange: (s: number) => void;
}) {
  const [sizes, setSizes] = useState<number[]>([props.current]);
  useEffect(() => {
    api.routes().then(d => {
      const s = d.routes
        .filter(r => r.pair_name === props.pair && r.from_chain === props.fromChain && r.to_chain === props.toChain)
        .map(r => r.from_amount_hr);
      setSizes([...new Set(s)].sort((a, b) => a - b));
    });
  }, [props.pair, props.fromChain, props.toChain]);
  return (
    <label>Size:{" "}
      <select value={props.current} onChange={e => props.onChange(Number(e.target.value))}>
        {sizes.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
  );
}
```

### Task 11.2: Timeseries page

- [ ] **Create `web/src/pages/Timeseries.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
} from "recharts";
import { api, type TimeseriesPoint } from "../api.js";
import { SizeSelector } from "../components/SizeSelector.js";

export default function Timeseries() {
  const [params, setParams] = useSearchParams();
  const pair = params.get("pair") ?? "";
  const from = Number(params.get("from") ?? 0);
  const to   = Number(params.get("to")   ?? 0);
  const size = Number(params.get("size") ?? 0);

  const [points, setPoints] = useState<TimeseriesPoint[]>([]);
  useEffect(() => {
    if (!pair || !from || !to || !size) return;
    api.timeseries({ pair, from, to, size }).then(r => setPoints(r.points));
  }, [pair, from, to, size]);

  const data = useMemo(() =>
    points.map(p => ({
      ...p,
      label: new Date(p.ts).toISOString().slice(5, 16),
    })), [points]);

  if (!pair) return <div>Specify <code>?pair=&amp;from=&amp;to=&amp;size=</code> to view a route.</div>;

  return (
    <div>
      <h3 style={{ marginBottom: 8 }}>
        {pair} · chain {from} → {to}
      </h3>
      <SizeSelector pair={pair} fromChain={from} toChain={to} current={size}
        onChange={s => setParams({ pair, from: String(from), to: String(to), size: String(s) })} />

      <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        Output amount (intent vs best alternative)
      </p>
      <div style={{ height: 260, marginTop: 4 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={["auto","auto"]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="intent_to_amount_hr" name="Intent" stroke="#2563eb" dot={false} />
            <Line type="monotone" dataKey="best_to_amount_hr"   name="Best"   stroke="#16a34a" dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p style={{ fontSize: 12, color: "#666", marginTop: 16 }}>
        Intent rank over time (1 = best)
      </p>
      <div style={{ height: 180, marginTop: 4 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis reversed allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [`#${v}`, "Rank"]} />
            <Line type="stepAfter" dataKey="intent_rank" name="Rank" stroke="#7c3aed" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

### Task 11.3: Wire + smoke

- [ ] Re-read `web/src/App.tsx`; replace stub:

```tsx
import Timeseries from "./pages/Timeseries.js";
```

- [ ] Click a `chart →` link from Snapshot; verify both charts render with data.

### Task 11.4: Commit

```bash
git add web/src/components/SizeSelector.tsx web/src/pages/Timeseries.tsx web/src/App.tsx
```
User runs:
```bash
git commit -m "feat(web): timeseries with intent-vs-best overlay and rank step chart"
```

### Phase 11 verification
- Two charts render with real data when navigating from Snapshot.

**Pause for user approval before Phase 12.**

---

## Phase 12 — Claude Code `/quote` skill

**Files:** `.claude/skills/quote/SKILL.md`

### Task 12.1: Create skill

- [ ] **Create `.claude/skills/quote/SKILL.md`**

````markdown
---
name: quote
description: Pull LI.FI intent quotes and compare to alternatives for tracked routes. Invoke when the user asks to "pull quotes", "run daily", "quote X from Y to Z", or similar.
---

# /quote — LI.FI intent quote runner

## When to invoke
- "pull today's quotes" / "run daily" → `pnpm pull:daily`
- "quote <size> <asset> <fromChain> to <toChain>" → `pnpm pull:adhoc -- --pair <PAIR> --from-chain <id> --to-chain <id> --size <n>`
- "quote <asset> every direction at <size>" → `pnpm pull:adhoc -- --pair <PAIR> --size <n>`
- "quote everything at <size>" → `pnpm pull:adhoc -- --size <n>`

## Chain IDs
Ethereum=1, Base=8453, Arbitrum=42161

## Asset pair names (must match config.json)
USDC-USDC, USDT-USDT, ETH-ETH, WETH-ETH

## Procedure
1. Parse intent into a command from the table above.
2. If pair or size is ambiguous, ask ONE clarifying question.
3. Run via Bash. Capture stdout.
4. Report: run_id, ok/partial/err counts, wall time.
5. For single-route runs, include the rank and delta_bps from stdout,
   plus the chart URL: `http://localhost:5173/route?pair=<P>&from=<F>&to=<T>&size=<S>`
6. Never edit files. Run-only.

## Examples
- "pull quotes for today"        → `pnpm pull:daily`
- "quote 5k USDC eth to base"    → `pnpm pull:adhoc -- --pair USDC-USDC --from-chain 1 --to-chain 8453 --size 5000`
- "quote 1 ETH everywhere"       → `pnpm pull:adhoc -- --pair ETH-ETH --size 1`
- "quote WETH to ETH at 0.1"     → `pnpm pull:adhoc -- --pair WETH-ETH --size 0.1`
````

### Task 12.2: Commit

```bash
git add .claude/skills/quote/SKILL.md
```
User runs:
```bash
git commit -m "feat(skill): /quote NL intent collector"
```

### Phase 12 verification
- `/quote pull today's quotes` in this repo invokes `pnpm pull:daily`.

---

## Cross-cutting verification (after Phase 12)

- [ ] `pnpm typecheck` — all workspaces clean.
- [ ] `pnpm test` — all workspaces passing.
- [ ] `pnpm pull:daily` — 84 requests × 2 calls; summary shows ok/partial/err.
- [ ] `pnpm dev` — server + web up; Snapshot shows rank column with colors; one chart link shows intent-vs-best overlay and rank step chart.
- [ ] `/quote` skill invokes collector, reports rank + delta.

## Open questions (from spec §12)

1. **Exact `@lifi/cli` intent command** — verified in Phase 6.1; locked in `lifi.ts` header comment.
2. **SDK `order` param for alternatives** — verified in Phase 6.4; locked in `lifi.ts` header comment.
3. **Rank metric** — gross `to_amount_hr` in v1. Inputs for net-of-gas stored; switch is server-only change.
4. **Tie-break rule** — `(to_amount_hr DESC, fee_usd ASC, tool ASC)`.
5. **Top-N cap** — 20 (configurable in `config.json`).

## Execution handoff

Plan complete. Subagent-Driven execution: dispatch one `general-purpose` subagent per phase with the phase text as its prompt + relevant prior context. I review between phases and wait for your approval before the next dispatch.
