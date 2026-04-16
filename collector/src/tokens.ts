import type { Address, ChainId } from "./types.js";

interface LifiToken { address: string; symbol: string; chainId: number; }
type Fetcher = () => Promise<unknown>;

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
      if (!cache) cache = ((await fetcher()) as { tokens: Record<string, LifiToken[]> }).tokens;
      const list = cache[String(chainId)];
      if (!list) throw new Error(`no tokens for chain ${chainId}`);
      const tok = list.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
      if (!tok) throw new Error(`token ${symbol} not found on chain ${chainId}`);
      return tok.address as Address;
    },
  };
}
