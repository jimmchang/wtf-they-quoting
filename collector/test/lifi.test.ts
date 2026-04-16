import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRoutesResponse, rankOffers, LIFI_INTENT_TOOL } from "../src/lifi.js";
import type { OfferFetchResult } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const routesRaw = readFileSync(join(here, "fixtures/routes-response.json"), "utf8");

describe("parseRoutesResponse", () => {
  it("returns array of ok offers", () => {
    const offers = parseRoutesResponse(routesRaw, 500);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]!.ok).toBe(true);
    expect(offers[0]!.toAmountHr).toBeGreaterThan(0);
  });

  it("exposes tool field for each offer", () => {
    const offers = parseRoutesResponse(routesRaw, 500);
    for (const o of offers) {
      if (o.ok) expect(typeof o.tool).toBe("string");
    }
  });
});

describe("rankOffers", () => {
  const makeOffer = (toAmountHr: number, tool: string): OfferFetchResult => ({
    ok: true, toAmountHr, tool, toAmount: String(Math.round(toAmountHr * 1e6)),
    rawJson: "{}", latencyMs: 100,
  });

  it("rank 1 = highest to_amount", () => {
    const ranked = rankOffers(
      makeOffer(999, "solver"),
      [makeOffer(1000, "stargate"), makeOffer(998, "hop")]
    );
    expect(ranked.intentRank).toBe(2);
    expect(ranked.delta_hr).toBeCloseTo(1);
    expect(ranked.delta_bps).toBeCloseTo(10);
  });

  it("intent rank=1 when it wins", () => {
    const ranked = rankOffers(
      makeOffer(1001, "solver"),
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
