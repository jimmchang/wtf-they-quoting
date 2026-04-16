import { ulid } from "ulid";
import type { Database as DB } from "better-sqlite3";
import type { RouteRequest, OfferFetchResult, RunKind, OfferRow, RequestRow, Address, ChainId } from "./types.js";
import { insertRequestWithOffers } from "./db.js";
import { rankOffers, LIFI_INTENT_TOOL } from "./lifi.js";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface RunMatrixOpts {
  db: DB;
  routes: RouteRequest[];
  runKind: RunKind;
  rateLimitRps: number;
  topN: number;
  resolveToken: (chainId: ChainId, symbol: string) => Promise<Address>;
  fetchAlternatives: (r: RouteRequest) => Promise<OfferFetchResult[]>;
  onProgress?: (done: number, total: number) => void;
}

export interface RunSummary {
  runId: string;
  ok: number;
  partial: number;
  err: number;
  wallMs: number;
}

export async function runMatrix(opts: RunMatrixOpts): Promise<RunSummary> {
  const runId = ulid();
  const t0 = Date.now();
  const delay = 1000 / Math.max(opts.rateLimitRps, 0.001);
  let ok = 0, partial = 0, err = 0;

  for (let i = 0; i < opts.routes.length; i++) {
    const r = opts.routes[i]!;
    const ts = Date.now();

    let fromToken: Address, toToken: Address;
    try {
      [fromToken, toToken] = await Promise.all([
        opts.resolveToken(r.fromChain, r.fromSymbol),
        opts.resolveToken(r.toChain, r.toSymbol),
      ]);
    } catch (e: any) {
      const req: RequestRow = {
        run_id: runId, run_kind: opts.runKind, ts,
        from_chain: r.fromChain, to_chain: r.toChain, pair_name: r.pairName,
        from_symbol: r.fromSymbol, to_symbol: r.toSymbol,
        from_token: "0x" as Address, to_token: "0x" as Address,
        from_amount: "0", from_amount_hr: r.fromAmountHr,
        intent_rank: null, best_to_amount_hr: null, intent_to_amount_hr: null,
        delta_hr: null, delta_bps: null, alt_count: 0,
        latency_intent_ms: null, latency_alts_ms: null,
        status: "error", error_message: `token resolution: ${e.message}`,
      };
      insertRequestWithOffers(opts.db, req, []);
      err++;
      opts.onProgress?.(i + 1, opts.routes.length);
      if (i < opts.routes.length - 1) await sleep(delay);
      continue;
    }

    const dec = r.fromSymbol.toUpperCase().startsWith("USD") ? 6 : 18;
    const fromAmount = BigInt(Math.round(r.fromAmountHr * 10 ** dec)).toString();

    const allOffers = await opts.fetchAlternatives(r);
    const callLatencyMs = allOffers.length > 0
      ? Math.max(...allOffers.map(a => a.latencyMs))
      : null;

    const intentResult = allOffers.find(a => a.ok && a.tool === LIFI_INTENT_TOOL);
    const goodAlts = allOffers
      .filter(a => a.ok && a.tool !== LIFI_INTENT_TOOL)
      .slice(0, opts.topN);

    const intentOk = intentResult !== undefined;
    const altsOk = goodAlts.length > 0;
    const status: "ok" | "partial" | "error" =
      intentOk && altsOk ? "ok"
      : !intentOk && !altsOk ? "error"
      : "partial";

    let intentRank: number | null = null;
    let bestAmt: number | null = null;
    let intentAmt: number | null = null;
    let deltaHr: number | null = null;
    let deltaBps: number | null = null;
    const offerRows: Omit<OfferRow, "request_id">[] = [];

    if (intentOk && intentResult && goodAlts.length > 0) {
      const ranked = rankOffers(intentResult, goodAlts);
      intentRank = ranked.intentRank;
      bestAmt = ranked.best_to_amount_hr;
      intentAmt = intentResult.toAmountHr ?? null;
      deltaHr = ranked.delta_hr;
      deltaBps = ranked.delta_bps;
      for (const entry of ranked.allOffers) {
        offerRows.push({
          source: entry.source,
          rank_by_to_amount: entry.rank,
          tool: entry.result.tool ?? null,
          to_amount: entry.result.toAmount ?? null,
          to_amount_hr: entry.result.toAmountHr ?? null,
          to_amount_usd: entry.result.toAmountUsd ?? null,
          gas_cost_usd: entry.result.gasCostUsd ?? null,
          fee_usd: entry.result.feeUsd ?? null,
          effective_rate: entry.result.toAmountHr != null
            ? entry.result.toAmountHr / r.fromAmountHr : null,
          raw_json: entry.result.rawJson,
        });
      }
    } else {
      // partial or error: store whatever succeeded
      if (intentOk && intentResult) {
        offerRows.push({
          source: "intent", rank_by_to_amount: null,
          tool: intentResult.tool ?? null,
          to_amount: intentResult.toAmount ?? null,
          to_amount_hr: intentResult.toAmountHr ?? null,
          to_amount_usd: intentResult.toAmountUsd ?? null,
          gas_cost_usd: intentResult.gasCostUsd ?? null,
          fee_usd: intentResult.feeUsd ?? null,
          effective_rate: intentResult.toAmountHr != null
            ? intentResult.toAmountHr / r.fromAmountHr : null,
          raw_json: intentResult.rawJson,
        });
      }
      for (const alt of goodAlts) {
        offerRows.push({
          source: "routes", rank_by_to_amount: null,
          tool: alt.tool ?? null,
          to_amount: alt.toAmount ?? null,
          to_amount_hr: alt.toAmountHr ?? null,
          to_amount_usd: alt.toAmountUsd ?? null,
          gas_cost_usd: alt.gasCostUsd ?? null,
          fee_usd: alt.feeUsd ?? null,
          effective_rate: alt.toAmountHr != null ? alt.toAmountHr / r.fromAmountHr : null,
          raw_json: alt.rawJson,
        });
      }
    }

    const req: RequestRow = {
      run_id: runId, run_kind: opts.runKind, ts,
      from_chain: r.fromChain, to_chain: r.toChain, pair_name: r.pairName,
      from_symbol: r.fromSymbol, to_symbol: r.toSymbol,
      from_token: fromToken, to_token: toToken,
      from_amount: fromAmount, from_amount_hr: r.fromAmountHr,
      intent_rank: intentRank,
      best_to_amount_hr: bestAmt,
      intent_to_amount_hr: intentAmt,
      delta_hr: deltaHr, delta_bps: deltaBps,
      alt_count: goodAlts.length,
      latency_intent_ms: null,
      latency_alts_ms: callLatencyMs,
      status,
      error_message: status === "error"
        ? allOffers[0]?.errorMessage ?? "no offers returned"
        : null,
    };

    insertRequestWithOffers(opts.db, req, offerRows.map(o => ({ ...o, request_id: 0 })));
    if (status === "ok") ok++;
    else if (status === "partial") partial++;
    else err++;

    opts.onProgress?.(i + 1, opts.routes.length);
    if (i < opts.routes.length - 1) await sleep(delay);
  }

  return { runId, ok, partial, err, wallMs: Date.now() - t0 };
}
