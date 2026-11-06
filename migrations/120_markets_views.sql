-- Market views: index constituents, stored screener presets and weekly market cap history.
-- Every row comes from EODHD and keeps display_allowed from canDisplay("eodhd") at write time (currently false).
-- GSPC.INDX and GDAXI.INDX fundamentals?filter=Components returned "0", "1", ... keyed rows of Code, Exchange,
-- Name, Sector, Industry and Weight on 2026-11-06; Weight was a fraction for GSPC and null for GDAXI.
CREATE TABLE index_components (
  index_symbol text NOT NULL REFERENCES tracked_assets(vendor_symbol),
  as_of date NOT NULL,
  code text NOT NULL,
  exchange text,
  name text,
  sector text,
  industry text,
  weight numeric,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (index_symbol, as_of, code)
);
CREATE INDEX IF NOT EXISTS index_components_latest ON index_components(index_symbol, as_of DESC);
-- Indices with no constituent list (VIX, for example) are retried only after the stale window, not every run.
CREATE TABLE index_component_refresh (
  index_symbol text PRIMARY KEY REFERENCES tracked_assets(vendor_symbol),
  attempted_at timestamptz NOT NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  status text NOT NULL CHECK (status IN ('ok','empty','failed'))
);

CREATE TABLE screener_runs (
  id bigserial PRIMARY KEY,
  preset text NOT NULL,
  as_of date NOT NULL,
  filters jsonb NOT NULL,
  signals text,
  sort text NOT NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preset, as_of)
);
CREATE TABLE screener_rows (
  run_id bigint NOT NULL REFERENCES screener_runs(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  code text NOT NULL,
  exchange text NOT NULL,
  name text,
  sector text,
  industry text,
  currency_symbol text,
  last_day date,
  adjusted_close numeric,
  change_1d_pct numeric,
  change_5d_pct numeric,
  market_cap numeric,
  dividend_yield numeric,
  avgvol_200d numeric,
  PRIMARY KEY (run_id, code, exchange)
);

CREATE TABLE market_cap_weekly (
  vendor_symbol text NOT NULL,
  week_end date NOT NULL,
  market_cap numeric NOT NULL CHECK (market_cap >= 0),
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (vendor_symbol, week_end)
);
CREATE TABLE market_cap_refresh (
  vendor_symbol text PRIMARY KEY,
  ticker text NOT NULL,
  attempted_at timestamptz NOT NULL,
  latest_week date,
  status text NOT NULL CHECK (status IN ('ok','empty','failed'))
);
CREATE INDEX IF NOT EXISTS market_cap_refresh_ticker ON market_cap_refresh(ticker);
