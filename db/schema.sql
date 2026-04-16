CREATE TABLE IF NOT EXISTS requests (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id              TEXT NOT NULL,
  run_kind            TEXT NOT NULL CHECK(run_kind IN ('daily','adhoc')),
  ts                  INTEGER NOT NULL,
  from_chain          INTEGER NOT NULL,
  to_chain            INTEGER NOT NULL,
  pair_name           TEXT NOT NULL,
  from_symbol         TEXT NOT NULL,
  to_symbol           TEXT NOT NULL,
  from_token          TEXT NOT NULL,
  to_token            TEXT NOT NULL,
  from_amount         TEXT NOT NULL,
  from_amount_hr      REAL NOT NULL,
  intent_rank         INTEGER,
  best_to_amount_hr   REAL,
  intent_to_amount_hr REAL,
  delta_hr            REAL,
  delta_bps           REAL,
  alt_count           INTEGER NOT NULL DEFAULT 0,
  latency_intent_ms   INTEGER,
  latency_alts_ms     INTEGER,
  status              TEXT NOT NULL CHECK(status IN ('ok','partial','error')),
  error_message       TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id        INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  source            TEXT NOT NULL CHECK(source IN ('intent','routes')),
  rank_by_to_amount INTEGER,
  tool              TEXT,
  to_amount         TEXT,
  to_amount_hr      REAL,
  to_amount_usd     REAL,
  gas_cost_usd      REAL,
  fee_usd           REAL,
  effective_rate    REAL,
  raw_json          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_ts    ON requests(ts);
CREATE INDEX IF NOT EXISTS idx_requests_route ON requests(pair_name, from_chain, to_chain, from_amount_hr);
CREATE INDEX IF NOT EXISTS idx_requests_run   ON requests(run_id);
CREATE INDEX IF NOT EXISTS idx_offers_request ON offers(request_id);
CREATE INDEX IF NOT EXISTS idx_offers_rank    ON offers(request_id, rank_by_to_amount);
