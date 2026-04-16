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
  insertOffer.run({ ...baseOffer, request_id: r2, source: "routes", rank_by_to_amount: 1,
    tool: "stargate", to_amount_hr: 10.0 });

  return db;
}

describe("handlers", () => {
  it("GET /api/runs returns most recent first", async () => {
    const { runs } = await buildApp(seededDb()).request("/api/runs").then(r => r.json());
    expect(runs[0].run_id).toBe("r2");
    expect(runs[0].ok_count).toBe(1);
  });

  it("GET /api/snapshot defaults to latest daily run with rank info", async () => {
    const { rows } = await buildApp(seededDb()).request("/api/snapshot").then(r => r.json());
    expect(rows[0].run_id).toBe("r2");
    expect(rows[0].intent_rank).toBe(1);
    expect(rows[0].delta_bps).toBe(0);
  });

  it("GET /api/snapshot with explicit run_id", async () => {
    const { rows } = await buildApp(seededDb()).request("/api/snapshot?run_id=r1").then(r => r.json());
    expect(rows[0].run_id).toBe("r1");
    expect(rows[0].intent_rank).toBe(2);
  });

  it("GET /api/timeseries returns points with delta_bps and intent_rank", async () => {
    const { points } = await buildApp(seededDb())
      .request("/api/timeseries?pair=USDC-USDC&from=1&to=8453&size=10")
      .then(r => r.json());
    expect(points).toHaveLength(2);
    expect(points[0].intent_rank).toBe(2);
    expect(points[1].intent_rank).toBe(1);
  });

  it("GET /api/timeseries returns 400 on missing params", async () => {
    const res = await buildApp(seededDb()).request("/api/timeseries?pair=USDC-USDC");
    expect(res.status).toBe(400);
  });

  it("GET /api/routes returns distinct route keys", async () => {
    const { routes } = await buildApp(seededDb()).request("/api/routes").then(r => r.json());
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]).toHaveProperty("pair_name");
  });
});
