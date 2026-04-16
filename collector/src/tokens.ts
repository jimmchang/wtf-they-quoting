import type { Address, ChainId } from "./types.js";

interface LifiToken { address: string; symbol: string; chainId: number; }
type Fetcher = () => Promise<unknown>;

// Fallback addresses for tokens that may be missing from the /tokens API response.
// Keyed as "SYMBOL:chainId".
const KNOWN_TOKENS: Record<string, string> = {
  "USDC:1":     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "USDC:8453":  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "USDC:42161": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "USDT:1":     "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "USDT:8453":  "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  "USDT:42161": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  "ETH:1":      "0x0000000000000000000000000000000000000000",
  "ETH:8453":   "0x0000000000000000000000000000000000000000",
  "ETH:42161":  "0x0000000000000000000000000000000000000000",
  "WETH:1":     "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "WETH:8453":  "0x4200000000000000000000000000000000000006",
  "WETH:42161": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
};

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
      const key = `${symbol.toUpperCase()}:${chainId}`;
      if (!cache) {
        try {
          cache = ((await fetcher()) as { tokens: Record<string, LifiToken[]> }).tokens;
        } catch {
          cache = {};
        }
      }
      const list = cache[String(chainId)];
      const tok = list?.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
      if (tok) return tok.address as Address;
      const fallback = KNOWN_TOKENS[key];
      if (fallback) return fallback as Address;
      throw new Error(`token ${symbol} not found on chain ${chainId}`);
    },
  };
}
