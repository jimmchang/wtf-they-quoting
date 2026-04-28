// LIFI_ALTS_SOURCE: SDK getRoutes with options.order = "RECOMMENDED"
// LIFI_INTENT_TOOL: "lifiIntents" — the lifiIntents offer is extracted from getRoutes results;
//                   no separate CLI call. Compare lifiIntents vs the best non-lifiIntents offer.
//
// Fixture field paths (confirmed against live responses):
//   Routes  (SDK getRoutes):
//     .routes[].toAmount (integer)  .routes[].gasCostUSD  .routes[].toToken.decimals
//     step tool: .routes[].steps[0].tool  .routes[].steps[0].toolDetails.key
//     step amt:  .routes[].steps[0].estimate.toAmount (integer)

import { getRoutes, createConfig } from "@lifi/sdk";
import type { OfferFetchResult, RouteRequest } from "./types.js";
import type { TokenResolver } from "./tokens.js";

let _sdkReady = false;
function ensureSdkConfig() {
  if (_sdkReady) return;
  createConfig({
    integrator: process.env.INTEGRATOR_STRING || "wtf-they-quoting",
    apiKey: process.env.NEXT_PUBLIC_LIFI_API_KEY || undefined,
  });
  _sdkReady = true;
}

export const LIFI_INTENT_TOOL = "lifiIntents";

function guessDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === "USDC" || s === "USDT") return 6;
  if (s === "ETH" || s === "WETH") return 18;
  throw new Error(`decimals unknown for symbol: ${symbol}`);
}

// ── Parse helpers ──────────────────────────────────────────────

/**
 * Parse the JSON output of SDK getRoutes.
 *
 * Shape: { routes: [{ toAmount, gasCostUSD, toToken: { decimals }, steps: [{ tool, toolDetails, estimate }] }] }
 */
export function parseRoutesResponse(raw: string, latencyMs: number): OfferFetchResult[] {
  try {
    const data = JSON.parse(raw);
    const routes: any[] = data.routes ?? [];
    return routes.map(r => {
      const decimals: number =
        r.toToken?.decimals ??
        r.steps?.[0]?.action?.toToken?.decimals ??
        6;
      // Prefer route-level toAmount (already accounts for all steps); fall back to first step
      const toAmountRaw = r.toAmount ?? r.steps?.[0]?.estimate?.toAmount;
      const toAmountHr = toAmountRaw != null ? Number(toAmountRaw) / 10 ** decimals : undefined;
      const step0 = r.steps?.[0] ?? {};
      const tool: string | undefined =
        step0.tool ?? step0.toolDetails?.key ?? undefined;
      const toAmountUsdRaw = r.toAmountUSD ?? step0.estimate?.toAmountUSD;
      return {
        ok: true,
        toAmount: String(toAmountRaw ?? ""),
        toAmountHr,
        toAmountUsd: toAmountUsdRaw != null ? Number(toAmountUsdRaw) : undefined,
        gasCostUsd: r.gasCostUSD != null ? Number(r.gasCostUSD) : undefined,
        feeUsd: undefined,
        tool,
        rawJson: JSON.stringify(r),
        latencyMs,
      };
    });
  } catch (e: any) {
    return [{ ok: false, errorMessage: `parse: ${e.message}`, rawJson: raw, latencyMs }];
  }
}

// ── Fetch functions ────────────────────────────────────────────

/**
 * Fetch all routes via SDK getRoutes (includes lifiIntents when available).
 * The runner splits results into intent (tool === LIFI_INTENT_TOOL) vs alternatives.
 */
export async function fetchAlternatives(
  req: RouteRequest,
  resolver: TokenResolver,
  opts: { slippage: number; timeoutMs: number }
): Promise<OfferFetchResult[]> {
  const fromToken = await resolver.resolve(req.fromChain, req.fromSymbol);
  const toToken = await resolver.resolve(req.toChain, req.toSymbol);
  const dec = guessDecimals(req.fromSymbol);
  const fromAmount = BigInt(Math.round(req.fromAmountHr * 10 ** dec)).toString();
  const t0 = Date.now();

  ensureSdkConfig();
  try {
    const result = await Promise.race([
      getRoutes({
        fromChainId: req.fromChain,
        toChainId: req.toChain,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount,
        options: { slippage: opts.slippage, order: "RECOMMENDED" as any },
      } as any),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("alts timeout")), opts.timeoutMs)
      ),
    ]);
    const latencyMs = Date.now() - t0;
    return parseRoutesResponse(JSON.stringify(result), latencyMs)
      .filter(o => o.ok)
      .sort((a, b) => (b.toAmountHr ?? 0) - (a.toAmountHr ?? 0));
  } catch (e: any) {
    return [{
      ok: false,
      errorMessage: e.message,
      rawJson: JSON.stringify({ error: e.message }),
      latencyMs: Date.now() - t0,
    }];
  }
}

// ── Ranking ────────────────────────────────────────────────────

export interface RankResult {
  intentRank: number;
  best_to_amount_hr: number;
  delta_hr: number;
  delta_bps: number;
  allOffers: Array<{ source: "intent" | "routes"; rank: number; result: OfferFetchResult }>;
}

/**
 * Rank the intent offer against alternatives by toAmountHr (descending).
 * delta_hr / delta_bps measure how far the intent is behind the best offer.
 * Both are 0 when the intent itself is best.
 */
export function rankOffers(
  intent: OfferFetchResult,
  alternatives: OfferFetchResult[]
): RankResult {
  const combined: Array<{ source: "intent" | "routes"; result: OfferFetchResult }> = [
    { source: "intent", result: intent },
    ...alternatives.map(r => ({ source: "routes" as const, result: r })),
  ];

  const sorted = [...combined].sort((a, b) => {
    const diff = (b.result.toAmountHr ?? 0) - (a.result.toAmountHr ?? 0);
    if (diff !== 0) return diff;
    const feeDiff = (a.result.feeUsd ?? 0) - (b.result.feeUsd ?? 0);
    if (feeDiff !== 0) return feeDiff;
    return (a.result.tool ?? "").localeCompare(b.result.tool ?? "");
  });

  const allOffers = sorted.map((entry, i) => ({ ...entry, rank: i + 1 }));
  const intentEntry = allOffers.find(e => e.source === "intent")!;
  const best = sorted[0]!.result.toAmountHr ?? 0;
  const intentAmt = intent.toAmountHr ?? 0;
  const delta_hr = Math.max(0, best - intentAmt);
  const delta_bps = best > 0 ? (delta_hr / best) * 10000 : 0;

  return {
    intentRank: intentEntry.rank,
    best_to_amount_hr: best,
    delta_hr,
    delta_bps,
    allOffers,
  };
}
