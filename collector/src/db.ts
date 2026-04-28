import Database, { type Database as DB } from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RequestRow, OfferRow, RunKind } from "./types.js";

const SCHEMA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../db/schema.sql"
);

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(SCHEMA, "utf8"));
  return db;
}

const REQUEST_COLS = [
  "run_id","run_kind","ts","from_chain","to_chain","pair_name",
  "from_symbol","to_symbol","from_token","to_token",
  "from_amount","from_amount_hr","intent_rank","best_to_amount_hr",
  "intent_to_amount_hr","delta_hr","delta_bps","alt_count",
  "latency_intent_ms","latency_alts_ms","status","error_message"
] as const;

const OFFER_COLS = [
  "request_id","source","rank_by_to_amount","tool",
  "to_amount","to_amount_hr","to_amount_usd","gas_cost_usd",
  "fee_usd","effective_rate","raw_json"
] as const;

export function insertRequestWithOffers(
  db: DB, req: RequestRow, offers: OfferRow[]
): number {
  const insertReq = db.prepare(
    `INSERT INTO requests (${REQUEST_COLS.join(",")})
     VALUES (${REQUEST_COLS.map(c => `@${c}`).join(",")})`
  );
  const insertOffer = db.prepare(
    `INSERT INTO offers (${OFFER_COLS.join(",")})
     VALUES (${OFFER_COLS.map(c => `@${c}`).join(",")})`
  );

  return db.transaction(() => {
    const result = insertReq.run(req);
    const reqId = result.lastInsertRowid as number;
    for (const o of offers) {
      insertOffer.run({ ...o, request_id: reqId });
    }
    return reqId;
  })();
}

interface RunSummary {
  run_id: string;
  run_kind: RunKind;
  ts: number;
  ok_count: number;
  partial_count: number;
  err_count: number;
}

export function getLatestRun(db: DB, kind?: RunKind): RunSummary | null {
  const where = kind ? "WHERE run_kind = ?" : "";
  const params = kind ? [kind] : [];
  return (db.prepare(
    `SELECT run_id, run_kind, MAX(ts) AS ts,
       SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) AS ok_count,
       SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) AS partial_count,
       SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS err_count
     FROM requests ${where}
     GROUP BY run_id ORDER BY MAX(ts) DESC LIMIT 1`
  ).get(...params) as RunSummary | undefined) ?? null;
}
