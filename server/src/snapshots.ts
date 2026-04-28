import type { Database as DB } from "better-sqlite3";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

interface RunRow {
  run_id: string;
  run_kind: string;
  ts: number;
  ok_count: number;
  partial_count: number;
  err_count: number;
}

interface RouteRow {
  pair_name: string;
  from_chain: number;
  to_chain: number;
  from_amount_hr: number;
}

export function timeseriesKey(pair: string, from: number, to: number, size: number) {
  return `${encodeURIComponent(pair)}__${from}__${to}__${size}`;
}

function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
}

export function generateSnapshots(db: DB, outDir: string) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const runs = db.prepare(
    `SELECT run_id, run_kind, MAX(ts) AS ts,
       SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok_count,
       SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) AS partial_count,
       SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS err_count
     FROM requests GROUP BY run_id ORDER BY ts DESC LIMIT 30`
  ).all() as RunRow[];
  writeJson(join(outDir, "runs.json"), { runs });

  const snapshotSql = db.prepare(
    `SELECT r.*,
       intent_o.tool AS intent_tool,
       best_o.tool   AS best_tool
     FROM requests r
     LEFT JOIN offers intent_o ON intent_o.request_id = r.id AND intent_o.source = 'intent'
     LEFT JOIN offers best_o   ON best_o.request_id   = r.id
                               AND best_o.source = 'routes'
                               AND best_o.rank_by_to_amount = 1
     WHERE r.run_id = ?
     ORDER BY r.pair_name, r.from_chain, r.to_chain, r.from_amount_hr`
  );

  for (const r of runs) {
    const rows = snapshotSql.all(r.run_id);
    writeJson(join(outDir, "snapshot", `${r.run_id}.json`), { runId: r.run_id, rows });
  }

  const latestDailyRow = db.prepare(
    `SELECT run_id FROM requests WHERE run_kind='daily'
     GROUP BY run_id ORDER BY MAX(ts) DESC LIMIT 1`
  ).get() as { run_id?: string } | undefined;
  const latestDaily = latestDailyRow?.run_id;
  if (latestDaily) {
    const rows = snapshotSql.all(latestDaily);
    writeJson(join(outDir, "snapshot", "latest.json"), { runId: latestDaily, rows });
  } else {
    writeJson(join(outDir, "snapshot", "latest.json"), { runId: "", rows: [] });
  }

  const routes = db.prepare(
    `SELECT DISTINCT pair_name, from_chain, to_chain, from_amount_hr
     FROM requests ORDER BY pair_name, from_chain, to_chain, from_amount_hr`
  ).all() as RouteRow[];
  writeJson(join(outDir, "routes.json"), { routes });

  const tsSql = db.prepare(
    `SELECT r.ts, r.intent_rank, r.intent_to_amount_hr, r.best_to_amount_hr,
            r.delta_hr, r.delta_bps, r.status,
            intent_o.tool AS intent_tool,
            best_o.tool   AS best_tool
     FROM requests r
     LEFT JOIN offers intent_o ON intent_o.request_id = r.id AND intent_o.source = 'intent'
     LEFT JOIN offers best_o   ON best_o.request_id   = r.id
                               AND best_o.source = 'routes'
                               AND best_o.rank_by_to_amount = 1
     WHERE r.pair_name = ? AND r.from_chain = ? AND r.to_chain = ? AND r.from_amount_hr = ?
     ORDER BY r.ts ASC`
  );

  for (const route of routes) {
    const points = tsSql.all(route.pair_name, route.from_chain, route.to_chain, route.from_amount_hr);
    const key = timeseriesKey(route.pair_name, route.from_chain, route.to_chain, route.from_amount_hr);
    writeJson(join(outDir, "timeseries", `${key}.json`), { points });
  }
}
