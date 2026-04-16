import { Hono } from "hono";
import type { Database as DB } from "better-sqlite3";

type AsyncApp = Omit<Hono, "request"> & {
  request(...args: Parameters<Hono["request"]>): Promise<Response>;
  fetch: Hono["fetch"];
};

/** Wraps a Hono app so that `.request()` always returns Promise<Response>. */
function wrapAsync(app: Hono): AsyncApp {
  const originalRequest = app.request.bind(app);
  return Object.assign(app, {
    request(...args: Parameters<Hono["request"]>): Promise<Response> {
      return Promise.resolve(originalRequest(...args));
    },
  }) as unknown as AsyncApp;
}

export function buildApp(db: DB) {
  const app = new Hono();

  app.get("/api/runs", c => {
    const limit = Number(c.req.query("limit") ?? 30);
    const runs = db.prepare(
      `SELECT run_id, run_kind, MAX(ts) AS ts,
         SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok_count,
         SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) AS partial_count,
         SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS err_count
       FROM requests GROUP BY run_id ORDER BY ts DESC LIMIT ?`
    ).all(limit);
    return c.json({ runs });
  });

  app.get("/api/snapshot", c => {
    const runId = c.req.query("run_id") ?? (db.prepare(
      `SELECT run_id FROM requests WHERE run_kind='daily'
       GROUP BY run_id ORDER BY MAX(ts) DESC LIMIT 1`
    ).get() as { run_id?: string } | undefined)?.run_id;
    if (!runId) return c.json({ rows: [] });
    const rows = db.prepare(
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
    ).all(runId);
    return c.json({ runId, rows });
  });

  app.get("/api/routes", c => {
    const routes = db.prepare(
      `SELECT DISTINCT pair_name, from_chain, to_chain, from_amount_hr
       FROM requests ORDER BY pair_name, from_chain, to_chain, from_amount_hr`
    ).all();
    return c.json({ routes });
  });

  app.get("/api/timeseries", c => {
    const pair = c.req.query("pair");
    const from = Number(c.req.query("from"));
    const to   = Number(c.req.query("to"));
    const size = Number(c.req.query("size"));
    if (!pair || !from || !to || !size) return c.json({ error: "missing params" }, 400);

    const points = db.prepare(
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
    ).all(pair, from, to, size);
    return c.json({ points });
  });

  app.get("/api/request/:id/offers", c => {
    const id = Number(c.req.param("id"));
    const offers = db.prepare(
      `SELECT * FROM offers WHERE request_id = ? ORDER BY rank_by_to_amount ASC`
    ).all(id);
    return c.json({ offers });
  });

  return wrapAsync(app);
}
