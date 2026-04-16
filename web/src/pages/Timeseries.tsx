import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
import { api, type TimeseriesPoint } from "../api.js";
import { SizeSelector } from "../components/SizeSelector.js";

const CHAIN_NAMES: Record<number, string> = { 1: "Eth", 8453: "Base", 42161: "Arb" };
const chainName = (id: number) => CHAIN_NAMES[id] ?? String(id);

export default function Timeseries() {
  const [params, setParams] = useSearchParams();
  const pair = params.get("pair") ?? "";
  const from = Number(params.get("from") ?? 0);
  const to   = Number(params.get("to")   ?? 0);
  const size = Number(params.get("size") ?? 0);

  const [points, setPoints] = useState<TimeseriesPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pair || !from || !to || !size) return;
    setLoading(true);
    api.timeseries({ pair, from, to, size })
      .then(r => setPoints(r.points))
      .finally(() => setLoading(false));
  }, [pair, from, to, size]);

  const data = useMemo(() =>
    points.map(p => ({
      ...p,
      label: new Date(p.ts).toISOString().slice(5, 16).replace("T", " "),
    })),
    [points]
  );

  if (!pair || !from || !to || !size) {
    return (
      <div style={{ color: "#666", padding: 16 }}>
        Select a route from the <a href="/">Snapshot</a> page or provide{" "}
        <code>?pair=&from=&to=&size=</code> in the URL.
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>
        {pair} · {chainName(from)} → {chainName(to)}
      </h3>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <SizeSelector
          pair={pair} fromChain={from} toChain={to} current={size}
          onChange={s => setParams({ pair, from: String(from), to: String(to), size: String(s) })}
        />
        <span style={{ fontSize: 12, color: "#888" }}>
          {loading ? "loading…" : `${points.length} data point${points.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {points.length === 0 && !loading && (
        <div style={{ color: "#888", padding: 16 }}>No data for this route yet.</div>
      )}

      {points.length > 0 && (
        <>
          <p style={{ fontSize: 12, color: "#555", margin: "0 0 4px" }}>
            Output amount — intent (blue) vs best alternative (green dashed)
          </p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="intent_to_amount_hr"
                  name="Intent"
                  stroke="#2563eb"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="best_to_amount_hr"
                  name="Best alt"
                  stroke="#16a34a"
                  dot={false}
                  strokeDasharray="5 3"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p style={{ fontSize: 12, color: "#555", margin: "20px 0 4px" }}>
            Intent rank over time (1 = best, lower is better)
          </p>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  reversed
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  label={{ value: "rank", angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <Tooltip formatter={(v) => [`#${v}`, "Rank"]} />
                <Line
                  type="stepAfter"
                  dataKey="intent_rank"
                  name="Rank"
                  stroke="#7c3aed"
                  dot={{ r: 3, fill: "#7c3aed" }}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
