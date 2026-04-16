import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer,
} from "recharts";
import { api, type TimeseriesPoint } from "../api.js";
import { SizeSelector } from "../components/SizeSelector.js";
import { cn } from "../lib/utils.js";

const CHAIN: Record<number, string> = { 1: "ETH", 8453: "BASE", 42161: "ARB" };
const chainName = (id: number) => CHAIN[id] ?? String(id);

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-card] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[--color-border]">
        <span className="text-xs font-medium uppercase tracking-wider text-[--color-muted-foreground]">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number | string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-[--color-border] bg-[--color-card] px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-[--color-muted-foreground] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(6) : p.value}
        </p>
      ))}
    </div>
  );
}

function RankTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const rank = payload[0]?.value ?? 0;
  return (
    <div className="rounded border border-[--color-border] bg-[--color-card] px-3 py-2 text-xs font-mono shadow-xl">
      <p className="text-[--color-muted-foreground] mb-1">{label}</p>
      <p className={cn(
        rank === 1 ? "text-[--color-accent]" : rank <= 3 ? "text-[--color-accent-amber]" : "text-[--color-accent-red]"
      )}>
        rank: #{rank}
      </p>
    </div>
  );
}

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
      label: new Date(p.ts).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
      }),
    })),
    [points]
  );

  if (!pair || !from || !to || !size) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-[--color-muted-foreground]">
        <p className="text-sm">Select a route from the <a href="/" className="text-[--color-accent] hover:underline">Snapshot</a> page</p>
        <p className="text-xs font-mono mt-1 text-[--color-border]">or provide ?pair=&amp;from=&amp;to=&amp;size= in the URL</p>
      </div>
    );
  }

  const CHART_PROPS = {
    margin: { top: 4, right: 8, left: 0, bottom: 4 },
    style: { fontSize: 11, fontFamily: "var(--font-mono)" },
  };

  const AXIS_PROPS = {
    tick: { fill: "oklch(0.5 0.01 265)", fontSize: 10, fontFamily: "var(--font-mono)" },
    axisLine: { stroke: "oklch(0.88 0.005 265)" },
    tickLine: false as const,
  };

  const GRID_PROPS = {
    strokeDasharray: "1 4",
    stroke: "oklch(0.88 0.005 265)",
    vertical: false,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-semibold font-mono">
            {pair}
            <span className="text-[--color-muted-foreground] font-normal"> · </span>
            <span className="text-[--color-accent]">{chainName(from)}</span>
            <span className="text-[--color-muted-foreground]"> → </span>
            <span className="text-[--color-accent]">{chainName(to)}</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <SizeSelector
            pair={pair} fromChain={from} toChain={to} current={size}
            onChange={s => setParams({ pair, from: String(from), to: String(to), size: String(s) })}
          />
          <span className="text-xs font-mono text-[--color-muted-foreground]">
            {loading
              ? <span className="animate-pulse">loading…</span>
              : `${points.length} point${points.length !== 1 ? "s" : ""}`
            }
          </span>
        </div>
      </div>

      {points.length === 0 && !loading && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-8 text-center">
          <p className="text-sm text-[--color-muted-foreground]">No data for this route yet.</p>
          <p className="text-xs font-mono text-[--color-border] mt-1">
            Run pnpm pull:adhoc -- --pair {pair} --from-chain {from} --to-chain {to} --size {size}
          </p>
        </div>
      )}

      {points.length > 0 && (
        <>
          {/* Output amount chart */}
          <ChartCard title="Output amount — intent vs best alternative">
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={data} {...CHART_PROPS}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_PROPS} />
                  <YAxis domain={["auto", "auto"]} {...AXIS_PROPS} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="intent_to_amount_hr"
                    name="Intent"
                    stroke="oklch(0.5 0.17 145)"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="best_to_amount_hr"
                    name="Best alt"
                    stroke="oklch(0.52 0.22 25)"
                    dot={false}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[--color-muted-foreground]">
                <span className="inline-block w-4 h-0.5 bg-[--color-accent]" />Intent
              </span>
              <span className="flex items-center gap-1.5 text-[--color-muted-foreground]">
                <span className="inline-block w-4 h-0.5 border-dashed" style={{ borderTop: "1.5px dashed oklch(0.52 0.22 25)", background: "none" }} />Best alt
              </span>
            </div>
          </ChartCard>

          {/* Rank chart */}
          <ChartCard title="Intent rank over time (1 = best)">
            <div style={{ height: 180 }}>
              <ResponsiveContainer>
                <LineChart data={data} {...CHART_PROPS}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="label" {...AXIS_PROPS} />
                  <YAxis
                    reversed
                    allowDecimals={false}
                    {...AXIS_PROPS}
                    width={24}
                    domain={[1, "auto"]}
                    tickFormatter={(v: number) => `#${v}`}
                  />
                  <Tooltip content={<RankTooltip />} />
                  <Line
                    type="stepAfter"
                    dataKey="intent_rank"
                    name="Rank"
                    stroke="oklch(0.5 0.17 145)"
                    dot={{ r: 2.5, fill: "oklch(0.5 0.17 145)", strokeWidth: 0 }}
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
