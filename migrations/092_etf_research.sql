-- ETF research track (owner decision 2026-10-21): a weekly AI web-research run for ETFs and other funds, kept apart from the stock pipeline.
-- Additive: new tables only. Facts come from the model's search, every evidence quote is checked server side before a row is marked verified.
CREATE TABLE IF NOT EXISTS etf_research_runs (
  id uuid PRIMARY KEY,
  as_of date NOT NULL,
  adapter text NOT NULL,
  model text,
  prompt_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'failed', 'cutoff', 'skipped')),
  stop_reason text,
  started_at timestamptz,
  finished_at timestamptz,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_output jsonb,
  picks_count integer NOT NULL DEFAULT 0,
  verified_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etf_research_runs_date_idx ON etf_research_runs (as_of DESC);

-- One row per ETF. Re-seen funds are updated in place; every sighting is kept in etf_pick_history.
CREATE TABLE IF NOT EXISTS etf_picks (
  symbol text PRIMARY KEY,
  exchange text,
  name text NOT NULL,
  isin text,
  asset_class text NOT NULL CHECK (asset_class IN ('equity', 'bond', 'commodity', 'multi_asset', 'other')),
  region text,
  call text NOT NULL CHECK (call IN ('BUY_ZONE', 'WATCH', 'AVOID')),
  conviction smallint CHECK (conviction BETWEEN 1 AND 5),
  thesis text NOT NULL DEFAULT '',
  what_happened jsonb NOT NULL DEFAULT '[]'::jsonb,
  why_it_matters text NOT NULL DEFAULT '',
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ter_pct numeric(6,3),
  aum_usd_m numeric(14,1),
  tracked_index text,
  domicile text,
  replication text,
  price numeric(14,4),
  price_currency text,
  price_as_of date,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified', 'partial', 'unverified')),
  first_seen_at date NOT NULL,
  last_seen_at date NOT NULL,
  first_run_id uuid REFERENCES etf_research_runs(id),
  last_run_id uuid REFERENCES etf_research_runs(id),
  entry_price numeric(14,4),
  entry_date date,
  benchmark_symbol text NOT NULL DEFAULT 'SPY',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etf_picks_class_idx ON etf_picks (asset_class, call);

CREATE TABLE IF NOT EXISTS etf_pick_history (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL REFERENCES etf_picks(symbol),
  run_id uuid NOT NULL REFERENCES etf_research_runs(id),
  as_of date NOT NULL,
  call text NOT NULL,
  conviction smallint,
  price numeric(14,4),
  price_currency text,
  UNIQUE (symbol, run_id)
);

-- Own measurement: forward return of a pick from its entry close against the benchmark, per horizon. Filled by the etf-outcomes job where a price series exists.
CREATE TABLE IF NOT EXISTS etf_outcomes (
  symbol text NOT NULL REFERENCES etf_picks(symbol),
  horizon_days smallint NOT NULL CHECK (horizon_days IN (30, 60, 90, 180)),
  entry_date date NOT NULL,
  entry_price numeric(14,4) NOT NULL,
  exit_date date NOT NULL,
  exit_price numeric(14,4) NOT NULL,
  return_pct numeric(8,3) NOT NULL,
  benchmark_symbol text NOT NULL,
  benchmark_return_pct numeric(8,3),
  excess_pct numeric(8,3),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, horizon_days)
);
