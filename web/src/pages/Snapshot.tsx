import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils.js";
import { api, type SnapshotRowDTO, type RunDTO } from "../api.js";

const CHAIN: Record<number, { name: string; color: string }> = {
  1:     { name: "ETH",  color: "text-blue-400 bg-blue-400/10" },
  8453:  { name: "BASE", color: "text-blue-300 bg-blue-300/10" },
  42161: { name: "ARB",  color: "text-sky-400 bg-sky-400/10"   },
};

function ChainBadge({ id }: { id: number }) {
  const c = CHAIN[id] ?? { name: String(id), color: "text-zinc-400 bg-zinc-400/10" };
  return (
    <span className={cn("font-mono text-[10px] font-medium px-1.5 py-0.5 rounded", c.color)}>
      {c.name}
    </span>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) return <span className="font-mono text-[--color-muted-foreground]">—</span>;
  const cls =
    rank === 1 ? "text-[--color-accent] bg-[--color-accent]/10 ring-1 ring-[--color-accent]/30" :
    rank <= 3  ? "text-[--color-accent-amber] bg-[--color-accent-amber]/10 ring-1 ring-[--color-accent-amber]/30" :
                 "text-[--color-accent-red] bg-[--color-accent-red]/10 ring-1 ring-[--color-accent-red]/30";
  return (
    <span className={cn("font-mono text-xs font-semibold px-2 py-0.5 rounded-full", cls)}>
      #{rank}
    </span>
  );
}


function formatTs(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const CHAIN_NAMES: Record<number, string> = { 1: "ETH", 8453: "BASE", 42161: "ARB" };

function FilterSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-[--color-muted-foreground]">
      <span className="uppercase tracking-wider font-medium">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-[--color-muted] border border-[--color-border] rounded px-2 py-1 font-mono text-xs text-[--color-foreground] focus:outline-none focus:ring-1 focus:ring-[--color-accent]"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export default function Snapshot() {
  const [runs, setRuns] = useState<RunDTO[]>([]);
  const [runId, setRunId] = useState<string | undefined>();
  const [rows, setRows] = useState<SnapshotRowDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPair, setFilterPair] = useState("");
  const [filterRoute, setFilterRoute] = useState("");
  const [filterSize, setFilterSize] = useState("");

  useEffect(() => { api.runs().then(r => setRuns(r.runs)); }, []);

  useEffect(() => {
    setLoading(true);
    api.snapshot(runId)
      .then(s => { setRows(s.rows); setRunId(s.runId); })
      .finally(() => setLoading(false));
  }, [runId]);

  const pairs = [...new Set(rows.map(r => r.pair_name))].sort();
  const routes = [...new Set(rows.map(r => `${CHAIN_NAMES[r.from_chain] ?? r.from_chain}→${CHAIN_NAMES[r.to_chain] ?? r.to_chain}`))].sort();
  const sizes = [...new Set(rows.map(r => String(r.from_amount_hr)))].sort((a, b) => Number(a) - Number(b));

  const filtered = rows.filter(r => {
    if (filterPair && r.pair_name !== filterPair) return false;
    const routeStr = `${CHAIN_NAMES[r.from_chain] ?? r.from_chain}→${CHAIN_NAMES[r.to_chain] ?? r.to_chain}`;
    if (filterRoute && routeStr !== filterRoute) return false;
    if (filterSize && String(r.from_amount_hr) !== filterSize) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-sm font-medium text-[--color-muted-foreground] uppercase tracking-wider">
          Intent vs Alternatives
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <FilterSelect label="Pair" value={filterPair} options={pairs} onChange={setFilterPair} />
          <FilterSelect label="Route" value={filterRoute} options={routes} onChange={setFilterRoute} />
          <FilterSelect label="Size" value={filterSize} options={sizes} onChange={setFilterSize} />
          {(filterPair || filterRoute || filterSize) && (
            <button
              onClick={() => { setFilterPair(""); setFilterRoute(""); setFilterSize(""); }}
              className="text-xs text-[--color-muted-foreground] hover:text-[--color-foreground] font-mono underline"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {loading && (
            <span className="text-xs text-[--color-muted-foreground] font-mono animate-pulse">
              loading…
            </span>
          )}
          <select
            value={runId ?? ""}
            onChange={e => setRunId(e.target.value || undefined)}
            className="bg-[--color-muted] border border-[--color-border] rounded px-2 py-1 text-xs font-mono text-[--color-foreground] focus:outline-none focus:ring-1 focus:ring-[--color-accent]"
          >
            {runs.map(r => (
              <option key={r.run_id} value={r.run_id}>
                {formatTs(r.ts)} · {r.run_kind} · {r.ok_count}✓ {r.partial_count}~ {r.err_count}✗
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[--color-border] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--color-border] bg-[--color-muted]">
              {["Pair", "Route", "Size", "Rank", "Δ bps", "Intent quote", "Best quote", "Best tool", "Alts", ""].map(h => (
                <th key={h} className="text-left px-3 py-2 text-xs font-medium text-[--color-muted-foreground] uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr
                key={i}
                className="border-b border-[--color-border] last:border-0 hover:bg-[--color-muted]/50 transition-colors"
              >
                <td className="px-3 py-2 font-mono text-xs font-medium">{r.pair_name}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1">
                    <ChainBadge id={r.from_chain} />
                    <span className="text-[--color-muted-foreground] text-xs">→</span>
                    <ChainBadge id={r.to_chain} />
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">{r.from_amount_hr}</td>
                <td className="px-3 py-2"><RankBadge rank={r.intent_rank} /></td>
                <td className="px-3 py-2 font-mono text-xs tabular-nums text-right">
                  {r.delta_bps != null
                    ? <span className={r.delta_bps > 0 ? "text-[--color-accent-red]" : "text-[--color-accent]"}>
                        {r.delta_bps.toFixed(1)}
                      </span>
                    : <span className="text-[--color-muted-foreground]">—</span>
                  }
                </td>
                <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">
                  {r.intent_to_amount_hr != null ? r.intent_to_amount_hr.toFixed(4) : <span className="text-[--color-muted-foreground]">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-right tabular-nums">
                  {r.best_to_amount_hr != null ? r.best_to_amount_hr.toFixed(4) : <span className="text-[--color-muted-foreground]">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-[--color-muted-foreground]">
                  {r.best_tool ?? (r.intent_rank === 1 ? "lifiIntents" : "—")}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-right tabular-nums text-[--color-muted-foreground]">{r.alt_count}</td>
                <td className="px-3 py-2">
                  <Link
                    to={`/route?pair=${encodeURIComponent(r.pair_name)}&from=${r.from_chain}&to=${r.to_chain}&size=${r.from_amount_hr}`}
                    className="text-xs text-[--color-accent] hover:underline font-mono whitespace-nowrap"
                  >
                    chart →
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-[--color-muted-foreground]">
                  {rows.length === 0
                    ? <>No data yet. Run <code className="font-mono bg-[--color-muted] px-1 rounded">pnpm pull:adhoc</code> to collect quotes.</>
                    : "No rows match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[--color-muted-foreground]">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[--color-accent] inline-block" /> Rank #1 (intent wins)</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[--color-accent-amber] inline-block" /> Rank #2–3</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[--color-accent-red] inline-block" /> Rank #4+</span>
        <span className="ml-2">Δ bps = how far lifiIntents trails the best offer</span>
      </div>
    </div>
  );
}
