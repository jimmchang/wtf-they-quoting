// LIFI_INTENT_CMD:  npx @lifi/cli quote --from <chain> --to <chain> --from-token <addr> --to-token <addr> --amount <baseUnits> --from-address <addr> --json
// LIFI_INTENT_JSON: --json flag supported; stdout is clean JSON when flag is set
// LIFI_ALTS_ORDER:  SDK getRoutes with options.order = "RECOMMENDED"
//
// CLI verification (Part A findings):
//   - `lifi quote --json` produces clean JSON to stdout (no ANSI, no extra lines)
//   - `lifi routes` requires a non-zero --from-address and fails with zero address
//   - SDK getRoutes works without a fromAddress and returns routes[] array
//   - Intent uses CLI subprocess; alternatives use SDK getRoutes
//
// Fixture field paths (confirmed against live responses):
//   Intent  (lifi quote --json):
//     top-level: .tool  .estimate.toAmount (string)  .estimate.toAmountUSD
//                .estimate.feeCosts[].amountUSD  .estimate.gasCosts[].amountUSD
//     decimals:  .action.toToken.decimals
//   Routes  (SDK getRoutes):
//     .routes[].toAmount (integer)  .routes[].gasCostUSD  .routes[].toToken.decimals
//     step tool: .routes[].steps[0].tool  .routes[].steps[0].toolDetails.key
//     step amt:  .routes[].steps[0].estimate.toAmount (integer)

import { getRoutes, getQuote } from "@lifi/sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OfferFetchResult, RouteRequest, Address } from "./types.js";
import type { TokenResolver } from "./tokens.js";

const execFileAsync = promisify(execFile);

function guessDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === "USDC" || s === "USDT") return 6;
  if (s === "ETH" || s === "WETH") return 18;
  throw new Error(`decimals unknown for symbol: ${symbol}`);
}

// ── Parse helpers ──────────────────────────────────────────────

/**
 * Parse the JSON output of `lifi quote --json`.
 *
 * Top-level shape:
 *   { tool, action: { toToken: { decimals } }, estimate: { toAmount, toAmountUSD, feeCosts[], gasCosts[] } }
 */
export function parseIntentResponse(raw: string, latencyMs: number): OfferFetchResult {
  try {
    const j = JSON.parse(raw);
    const estimate = j.estimate ?? {};
    const decimals: number =
      j.action?.toToken?.decimals ??
      estimate.toToken?.decimals ??
      6;
    const toAmountRaw = estimate.toAmount;
    const toAmountHr =
      toAmountRaw != null ? Number(toAmountRaw) / 10 ** decimals : undefined;
    const feeUsd = Array.isArray(estimate.feeCosts)
      ? estimate.feeCosts.reduce((s: number, f: any) => s + Number(f.amountUSD ?? 0), 0)
      : undefined;
    const gasCostUsd = Array.isArray(estimate.gasCosts)
      ? estimate.gasCosts.reduce((s: number, g: any) => s + Number(g.amountUSD ?? 0), 0)
      : undefined;
    return {
      ok: true,
      toAmount: String(toAmountRaw ?? ""),
      toAmountHr,
      toAmountUsd: estimate.toAmountUSD != null ? Number(estimate.toAmountUSD) : undefined,
      gasCostUsd,
      feeUsd,
      tool: j.tool ?? j.toolDetails?.key,
      rawJson: raw,
      latencyMs,
    };
  } catch (e: any) {
    return { ok: false, errorMessage: `parse error: ${e.message}`, rawJson: raw, latencyMs };
  }
}

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
 * Fetch the best single quote via the LI.FI CLI (`lifi quote --json`).
 * Falls back to SDK getQuote if the CLI is unavailable.
 */
export async function fetchIntent(
  req: RouteRequest,
  resolver: TokenResolver,
  opts: { slippage: number; timeoutMs: number }
): Promise<OfferFetchResult> {
  const fromToken = await resolver.resolve(req.fromChain, req.fromSymbol);
  const toToken = await resolver.resolve(req.toChain, req.toSymbol);
  const dec = guessDecimals(req.fromSymbol);
  const fromAmount = BigInt(Math.round(req.fromAmountHr * 10 ** dec)).toString();
  const t0 = Date.now();

  try {
    const cliResult = await Promise.race([
      execFileAsync("npx", [
        "@lifi/cli",
        "quote",
        "--from", String(req.fromChain),
        "--to", String(req.toChain),
        "--from-token", fromToken,
        "--to-token", toToken,
        "--amount", fromAmount,
        "--from-address", "0x0000000000000000000000000000000000000001",
        "--json",
      ], { timeout: opts.timeoutMs }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("intent timeout")), opts.timeoutMs)
      ),
    ]);
    // stdout contains the JSON; stderr may have spinner text
    const raw = cliResult.stdout.trim();
    return parseIntentResponse(raw, Date.now() - t0);
  } catch (cliErr: any) {
    // CLI unavailable or timed out — fall back to SDK
    try {
      const result = await Promise.race([
        getQuote({
          fromChain: req.fromChain,
          toChain: req.toChain,
          fromToken,
          toToken,
          fromAmount,
          fromAddress: "0x0000000000000000000000000000000000000001" as Address,
        } as any),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("intent sdk timeout")), opts.timeoutMs)
        ),
      ]);
      return parseIntentResponse(JSON.stringify(result), Date.now() - t0);
    } catch (e: any) {
      return {
        ok: false,
        errorMessage: `cli: ${cliErr.message}; sdk: ${e.message}`,
        rawJson: JSON.stringify({ error: e.message }),
        latencyMs: Date.now() - t0,
      };
    }
  }
}

/**
 * Fetch route alternatives via SDK getRoutes, sorted by toAmountHr descending.
 */
export async function fetchAlternatives(
  req: RouteRequest,
  resolver: TokenResolver,
  opts: { slippage: number; timeoutMs: number; topN: number }
): Promise<OfferFetchResult[]> {
  const fromToken = await resolver.resolve(req.fromChain, req.fromSymbol);
  const toToken = await resolver.resolve(req.toChain, req.toSymbol);
  const dec = guessDecimals(req.fromSymbol);
  const fromAmount = BigInt(Math.round(req.fromAmountHr * 10 ** dec)).toString();
  const t0 = Date.now();

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
      .sort((a, b) => (b.toAmountHr ?? 0) - (a.toAmountHr ?? 0))
      .slice(0, opts.topN);
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
