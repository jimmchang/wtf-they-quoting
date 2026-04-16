import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SnapshotRowDTO, type RunDTO } from "../api.js";

const CHAIN_NAMES: Record<number, string> = { 1: "Eth", 8453: "Base", 42161: "Arb" };
const chainName = (id: number) => CHAIN_NAMES[id] ?? String(id);

function rankColor(rank: number | null): string {
  if (rank === null) return "#999";
  if (rank === 1) return "#16a34a";
  if (rank <= 3) return "#d97706";
  return "#dc2626";
}

export default function Snapshot() {
  const [runs, setRuns] = useState<RunDTO[]>([]);
  const [runId, setRunId] = useState<string | undefined>();
  const [rows, setRows] = useState<SnapshotRowDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.runs().then(r => setRuns(r.runs));
  }, []);

  useEffect(() => {
    setLoading(true);
    api.snapshot(runId)
      .then(s => { setRows(s.rows); setRunId(s.runId); })
      .finally(() => setLoading(false));
  }, [runId]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <strong>Run:</strong>
        <select value={runId ?? ""} onChange={e => setRunId(e.target.value || undefined)}>
          {runs.map(r => (
            <option key={r.run_id} value={r.run_id}>
              {new Date(r.ts).toISOString().slice(0, 16)} — {r.run_kind}
              {" "}({r.ok_count}ok / {r.partial_count}p / {r.err_count}err)
            </option>
          ))}
        </select>
        {loading && <span style={{ color: "#888", fontSize: 12 }}>loading…</span>}
      </div>

      <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th style={{ padding: "4px 8px" }}>Pair</th>
            <th style={{ padding: "4px 8px" }}>Route</th>
            <th style={{ padding: "4px 8px" }}>Size</th>
            <th style={{ padding: "4px 8px" }}>Rank</th>
            <th style={{ padding: "4px 8px" }}>Δ bps</th>
            <th style={{ padding: "4px 8px" }}>Intent tool</th>
            <th style={{ padding: "4px 8px" }}>Best tool</th>
            <th style={{ padding: "4px 8px" }}>Alts</th>
            <th style={{ padding: "4px 8px" }}>Status</th>
            <th style={{ padding: "4px 8px" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: "4px 8px" }}>{r.pair_name}</td>
              <td style={{ padding: "4px 8px" }}>{chainName(r.from_chain)} → {chainName(r.to_chain)}</td>
              <td style={{ padding: "4px 8px" }}>{r.from_amount_hr}</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: rankColor(r.intent_rank) }}>
                {r.intent_rank != null ? `#${r.intent_rank}` : "—"}
              </td>
              <td style={{ padding: "4px 8px" }}>
                {r.delta_bps != null ? r.delta_bps.toFixed(1) : "—"}
              </td>
              <td style={{ padding: "4px 8px" }}>{r.intent_tool ?? "—"}</td>
              <td style={{ padding: "4px 8px" }}>{r.best_tool ?? "—"}</td>
              <td style={{ padding: "4px 8px" }}>{r.alt_count}</td>
              <td style={{ padding: "4px 8px" }}>{r.status}</td>
              <td style={{ padding: "4px 8px" }}>
                <Link to={`/route?pair=${encodeURIComponent(r.pair_name)}&from=${r.from_chain}&to=${r.to_chain}&size=${r.from_amount_hr}`}>
                  chart →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
