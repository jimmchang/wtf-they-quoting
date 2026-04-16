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
  it("inserts one request + correct offers per route", async () => {
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
    expect(summary.partial).toBe(0);
    expect(summary.err).toBe(0);
    const req = db.prepare("SELECT * FROM requests LIMIT 1").get() as any;
    expect(req.intent_rank).toBe(2);        // solver(9.9) loses to stargate(10.0)
    expect(req.alt_count).toBe(2);
    expect(req.status).toBe("ok");
    const offers = db.prepare("SELECT * FROM offers ORDER BY rank_by_to_amount").all() as any[];
    expect(offers).toHaveLength(3);         // 1 intent + 2 alternatives
    expect(offers[0].tool).toBe("stargate"); // rank 1
    expect(offers[1].tool).toBe("solver");   // rank 2 (intent)
    rmSync(dir, { recursive: true, force: true });
  });

  it("records partial status when intent fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "runner-partial-"));
    const db = openDb(join(dir, "q.db"));
    const routes: RouteRequest[] = [
      { pairName: "U", fromChain: 1, toChain: 8453, fromSymbol: "USDC", toSymbol: "USDC", fromAmountHr: 10 },
    ];
    const summary = await runMatrix({
      db, routes, runKind: "adhoc", rateLimitRps: 1000,
      resolveToken: async () => ADDR,
      fetchIntent: async () => ({ ok: false, errorMessage: "timeout", rawJson: "{}", latencyMs: 5 }),
      fetchAlternatives: async () => [okOffer(10.0, "stargate")],
    });
    expect(summary.partial).toBe(1);
    const req = db.prepare("SELECT * FROM requests LIMIT 1").get() as any;
    expect(req.status).toBe("partial");
    expect(req.intent_rank).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("records error status when both fail", async () => {
    const dir = mkdtempSync(join(tmpdir(), "runner-err-"));
    const db = openDb(join(dir, "q.db"));
    const routes: RouteRequest[] = [
      { pairName: "U", fromChain: 1, toChain: 8453, fromSymbol: "USDC", toSymbol: "USDC", fromAmountHr: 10 },
    ];
    const summary = await runMatrix({
      db, routes, runKind: "daily", rateLimitRps: 1000,
      resolveToken: async () => ADDR,
      fetchIntent: async () => ({ ok: false, errorMessage: "fail1", rawJson: "{}", latencyMs: 5 }),
      fetchAlternatives: async () => [{ ok: false, errorMessage: "fail2", rawJson: "{}", latencyMs: 5 }],
    });
    expect(summary.err).toBe(1);
    const req = db.prepare("SELECT * FROM requests LIMIT 1").get() as any;
    expect(req.status).toBe("error");
    rmSync(dir, { recursive: true, force: true });
  });
});
