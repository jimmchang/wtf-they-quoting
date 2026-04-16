export type ChainId = number;
export type Address = `0x${string}`;
export type RunKind = "daily" | "adhoc";
export type RequestStatus = "ok" | "partial" | "error";
export type OfferSource = "intent" | "routes";

export interface AssetPair {
  name: string;
  from: string;
  to: string;
  sizes: number[];
}

export interface AppConfig {
  chains: ChainId[];
  assetPairs: AssetPair[];
  crossChainOnly: boolean;
  rateLimitRps: number;
  defaultSlippage: number;
  quoteTimeoutMs: number;
  alternativesTopN: number;
}

export interface RouteRequest {
  pairName: string;
  fromChain: ChainId;
  toChain: ChainId;
  fromSymbol: string;
  toSymbol: string;
  fromAmountHr: number;
}

/** Normalized result from either the intent or alternatives call */
export interface OfferFetchResult {
  ok: boolean;
  tool?: string;
  toAmount?: string;
  toAmountHr?: number;
  toAmountUsd?: number;
  gasCostUsd?: number;
  feeUsd?: number;
  errorMessage?: string;
  rawJson: string;
  latencyMs: number;
}

/** Persisted row in `requests` table */
export interface RequestRow {
  run_id: string;
  run_kind: RunKind;
  ts: number;
  from_chain: ChainId;
  to_chain: ChainId;
  pair_name: string;
  from_symbol: string;
  to_symbol: string;
  from_token: Address;
  to_token: Address;
  from_amount: string;
  from_amount_hr: number;
  intent_rank: number | null;
  best_to_amount_hr: number | null;
  intent_to_amount_hr: number | null;
  delta_hr: number | null;
  delta_bps: number | null;
  alt_count: number;
  latency_intent_ms: number | null;
  latency_alts_ms: number | null;
  status: RequestStatus;
  error_message: string | null;
}

/** Persisted row in `offers` table (id added by SQLite) */
export interface OfferRow {
  request_id: number;
  source: OfferSource;
  rank_by_to_amount: number | null;
  tool: string | null;
  to_amount: string | null;
  to_amount_hr: number | null;
  to_amount_usd: number | null;
  gas_cost_usd: number | null;
  fee_usd: number | null;
  effective_rate: number | null;
  raw_json: string;
}
