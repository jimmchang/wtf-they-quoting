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
