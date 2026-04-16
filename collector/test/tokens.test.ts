import { describe, it, expect } from "vitest";
import { createTokenResolver } from "../src/tokens.js";

const FAKE = {
  tokens: {
    "1": [
      { address: "0xDAI_ADDR_FROM_API", symbol: "DAI", chainId: 1 },
    ],
  },
};

describe("tokenResolver", () => {
  it("resolves known symbol from hardcoded table (ignoring API)", async () => {
    const r = createTokenResolver({ fetcher: async () => FAKE });
    expect(await r.resolve(1, "USDC")).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    expect(await r.resolve(1, "WETH")).toBe("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  });
  it("falls back to API for unknown tokens, fetches once", async () => {
    let n = 0;
    const r = createTokenResolver({ fetcher: async () => { n++; return FAKE; } });
    await r.resolve(1, "DAI");
    await r.resolve(1, "DAI");
    expect(n).toBe(1);
  });
  it("throws on unknown symbol not in table or API", async () => {
    const r = createTokenResolver({ fetcher: async () => FAKE });
    await expect(r.resolve(1, "FOO")).rejects.toThrow(/FOO.*chain 1/);
  });
});
