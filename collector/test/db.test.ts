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

const mkOffer = (overrides: Partial<OfferRow> = {}): OfferRow => ({
  request_id: 0, source: "intent", rank_by_to_amount: 2,
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
    const reqId = insertRequestWithOffers(db, mkReq(), []);
    expect(typeof reqId).toBe("number");
    const row = db.prepare("SELECT * FROM requests WHERE id=?").get(reqId) as RequestRow & { id: number };
    expect(row.pair_name).toBe("USDC-USDC");
    expect(row.intent_rank).toBe(2);
  });

  it("insertRequestWithOffers inserts offers linked by request_id", () => {
    const db = openDb(join(dir, "q.db"));
    const reqId = insertRequestWithOffers(db, mkReq(), [
      mkOffer({ source: "intent", rank_by_to_amount: 2 }),
      mkOffer({ source: "routes", rank_by_to_amount: 1 }),
    ]);
    const offers = db.prepare("SELECT * FROM offers WHERE request_id=?").all(reqId) as OfferRow[];
    expect(offers).toHaveLength(2);
    expect(offers.map(o => o.source).sort()).toEqual(["intent", "routes"]);
  });

  it("is transactional — if offers fail, request is rolled back", () => {
    const db = openDb(join(dir, "q.db"));
    const badOffer = mkOffer({ source: "INVALID" as any });
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
