import type { AppConfig, RouteRequest } from "./types.js";

export interface RouteFilter {
  fromChain?: number;
  toChain?: number;
  pair?: string;
  size?: number;
}

export function expandRoutes(cfg: AppConfig, f: RouteFilter = {}): RouteRequest[] {
  const out: RouteRequest[] = [];
  for (const p of cfg.assetPairs) {
    if (f.pair && f.pair !== p.name) continue;
    for (const fc of cfg.chains) {
      if (f.fromChain && f.fromChain !== fc) continue;
      for (const tc of cfg.chains) {
        if (f.toChain && f.toChain !== tc) continue;
        if (cfg.crossChainOnly && fc === tc) continue;
        for (const s of p.sizes) {
          if (f.size && f.size !== s) continue;
          out.push({ pairName: p.name, fromChain: fc, toChain: tc,
                     fromSymbol: p.from, toSymbol: p.to, fromAmountHr: s });
        }
      }
    }
  }
  return out;
}
