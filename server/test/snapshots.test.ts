import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateSnapshots, timeseriesKey } from "../src/snapshots.js";

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
    run_kind: "daily", from_chain: 1, to_chain: 8453, pair_name: "ETH/USDC",
    from_symbol: "ETH", to_symbol: "USDC", from_token: "0x1", to_token: "0x2",
    from_amount: "1000000000000000000", from_amount_hr: 1, alt_count: 1,
    latency_intent_ms: 400, latency_alts_ms: 600, error_message: null,
  };

  const r1 = (insertReq.get({ ...baseReq, run_id: "r1", ts: 100,
    intent_rank: 2, best_to_amount_hr: 3000, intent_to_amount_hr: 2990,
    delta_hr: 10, delta_bps: 33, status: "ok" }) as { id: number }).id;
  const r2 = (insertReq.get({ ...baseReq, run_id: "r2", ts: 200,
    intent_rank: 1, best_to_amount_hr: 3000, intent_to_amount_hr: 3000,
    delta_hr: 0, delta_bps: 0, status: "ok" }) as { id: number }).id;

  const baseOffer = { to_amount: "3000000000", to_amount_usd: 3000, gas_cost_usd: 0.1,
    fee_usd: 0.05, effective_rate: 1.0, raw_json: "{}" };
  insertOffer.run({ ...baseOffer, request_id: r1, source: "intent", rank_by_to_amount: 2,
    tool: "lifiIntents", to_amount_hr: 2990 });
  insertOffer.run({ ...baseOffer, request_id: r1, source: "routes", rank_by_to_amount: 1,
    tool: "stargate", to_amount_hr: 3000 });
  insertOffer.run({ ...baseOffer, request_id: r2, source: "intent", rank_by_to_amount: 1,
    tool: "lifiIntents", to_amount_hr: 3000 });
  insertOffer.run({ ...baseOffer, request_id: r2, source: "routes", rank_by_to_amount: 1,
    tool: "stargate", to_amount_hr: 3000 });

  return db;
}

function readJson(file: string) {
  return JSON.parse(readFileSync(file, "utf8"));
}

describe("snapshots", () => {
  let outDir: string;
  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), "snapshots-"));
  });

  it("writes runs.json with most recent first", () => {
    generateSnapshots(seededDb(), outDir);
    const { runs } = readJson(join(outDir, "runs.json"));
    expect(runs[0].run_id).toBe("r2");
    expect(runs[0].ok_count).toBe(1);
    expect(runs).toHaveLength(2);
  });

  it("writes snapshot/latest.json pointing to latest daily run", () => {
    generateSnapshots(seededDb(), outDir);
    const { runId, rows } = readJson(join(outDir, "snapshot", "latest.json"));
    expect(runId).toBe("r2");
    expect(rows[0].intent_rank).toBe(1);
    expect(rows[0].intent_tool).toBe("lifiIntents");
    expect(rows[0].best_tool).toBe("stargate");
  });

  it("writes per-run snapshot files", () => {
    generateSnapshots(seededDb(), outDir);
    const r1 = readJson(join(outDir, "snapshot", "r1.json"));
    expect(r1.runId).toBe("r1");
    expect(r1.rows[0].intent_rank).toBe(2);
    expect(r1.rows[0].delta_bps).toBe(33);
  });

  it("writes routes.json with distinct route keys", () => {
    generateSnapshots(seededDb(), outDir);
    const { routes } = readJson(join(outDir, "routes.json"));
    expect(routes).toEqual([
      { pair_name: "ETH/USDC", from_chain: 1, to_chain: 8453, from_amount_hr: 1 },
    ]);
  });

  it("writes timeseries/<key>.json with points in chronological order", () => {
    generateSnapshots(seededDb(), outDir);
    const key = timeseriesKey("ETH/USDC", 1, 8453, 1);
    const { points } = readJson(join(outDir, "timeseries", `${key}.json`));
    expect(points).toHaveLength(2);
    expect(points[0].ts).toBe(100);
    expect(points[1].ts).toBe(200);
    expect(points[0].intent_rank).toBe(2);
    expect(points[1].intent_rank).toBe(1);
    expect(points[0].intent_tool).toBe("lifiIntents");
  });

  it("timeseriesKey escapes filename-unsafe characters in pair_name", () => {
    expect(timeseriesKey("ETH/USDC", 1, 8453, 1)).toBe("ETH%2FUSDC__1__8453__1");
  });

  it("removes stale per-run files when regenerating", () => {
    generateSnapshots(seededDb(), outDir);
    expect(existsSync(join(outDir, "snapshot", "r1.json"))).toBe(true);

    const db2 = new Database(":memory:");
    db2.exec(readFileSync(join(process.cwd(), "db/schema.sql"), "utf8"));
    generateSnapshots(db2, outDir);

    const files = readdirSync(join(outDir, "snapshot"));
    expect(files).not.toContain("r1.json");
    expect(files).not.toContain("r2.json");
  });

  it("emits empty stubs when db has no rows", () => {
    const db = new Database(":memory:");
    db.exec(readFileSync(join(process.cwd(), "db/schema.sql"), "utf8"));
    generateSnapshots(db, outDir);
    expect(readJson(join(outDir, "runs.json"))).toEqual({ runs: [] });
    expect(readJson(join(outDir, "routes.json"))).toEqual({ routes: [] });
    expect(readJson(join(outDir, "snapshot", "latest.json"))).toEqual({ runId: "", rows: [] });
  });
});
