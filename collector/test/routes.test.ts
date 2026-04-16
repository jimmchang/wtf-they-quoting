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
