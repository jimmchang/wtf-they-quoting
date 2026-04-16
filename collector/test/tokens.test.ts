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
