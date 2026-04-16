export interface SnapshotRowDTO {
  id: number;
  run_id: string;
  run_kind: "daily" | "adhoc";
  ts: number;
  pair_name: string;
  from_chain: number;
  to_chain: number;
  from_amount_hr: number;
  intent_rank: number | null;
  best_to_amount_hr: number | null;
  intent_to_amount_hr: number | null;
  delta_hr: number | null;
  delta_bps: number | null;
  alt_count: number;
  status: string;
  intent_tool: string | null;
  best_tool: string | null;
}

export interface RunDTO {
  run_id: string;
  run_kind: string;
  ts: number;
  ok_count: number;
  partial_count: number;
  err_count: number;
}

export interface TimeseriesPoint {
  ts: number;
  intent_rank: number | null;
  intent_to_amount_hr: number | null;
  best_to_amount_hr: number | null;
  delta_hr: number | null;
  delta_bps: number | null;
  intent_tool: string | null;
  best_tool: string | null;
  status: string;
}

export interface RouteKey {
  pair_name: string;
  from_chain: number;
  to_chain: number;
  from_amount_hr: number;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

export const api = {
  runs: () => get<{ runs: RunDTO[] }>("/api/runs"),
  snapshot: (runId?: string) =>
    get<{ runId: string; rows: SnapshotRowDTO[] }>(
      runId ? `/api/snapshot?run_id=${encodeURIComponent(runId)}` : "/api/snapshot"
    ),
  timeseries: (p: { pair: string; from: number; to: number; size: number }) =>
    get<{ points: TimeseriesPoint[] }>(
      `/api/timeseries?pair=${encodeURIComponent(p.pair)}&from=${p.from}&to=${p.to}&size=${p.size}`
    ),
  routes: () => get<{ routes: RouteKey[] }>("/api/routes"),
};
