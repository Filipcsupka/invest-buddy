-- ETF detail from EODHD ETF_Data, dividends and bars. All rows stay internal (display_allowed=false) until the
-- owner clears display rights for the eodhd source. Live checks on 2026-11-06: SPY.US listed all 501 holdings;
-- IWDA.AS listed only ten, with Holdings_Count=10, Yield=null and no currency for TotalAssets.
ALTER TABLE tracked_assets DROP CONSTRAINT IF EXISTS tracked_assets_asset_class_check;
ALTER TABLE tracked_assets ADD CONSTRAINT tracked_assets_asset_class_check CHECK (asset_class IN ('index','fx','crypto','etf'));

-- Catalog listings followed by the eodhd-etf job. vendor_symbol links to tracked_assets for bars and dividends.
CREATE TABLE IF NOT EXISTS etf_tracked (
  listing_key text PRIMARY KEY REFERENCES etf_catalog(listing_key),
  vendor_symbol text NOT NULL REFERENCES tracked_assets(vendor_symbol),
  rank integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  added_on date NOT NULL DEFAULT CURRENT_DATE,
  detail_fetched_at timestamptz,
  detail_status text CHECK (detail_status IS NULL OR detail_status IN ('ok','not_etf','isin_mismatch','failed')),
  dividends_fetched_at timestamptz,
  bars_fetched_at timestamptz
);
CREATE INDEX IF NOT EXISTS etf_tracked_due_idx ON etf_tracked (active, detail_fetched_at NULLS FIRST, rank);
CREATE INDEX IF NOT EXISTS etf_tracked_symbol_idx ON etf_tracked (vendor_symbol);

-- One row per listing and observation day. Percent fields are stored as percent values.
-- total_assets keeps the vendor number; total_assets_currency stays null unless the response names it.
CREATE TABLE IF NOT EXISTS etf_fund_stats (
  listing_key text NOT NULL REFERENCES etf_catalog(listing_key),
  as_of date NOT NULL,
  vendor_symbol text NOT NULL,
  origin text NOT NULL CHECK (origin IN ('job','enrich')),
  isin text,
  trading_currency text,
  total_assets numeric,
  total_assets_currency text,
  yield_pct numeric,
  dividend_frequency text,
  inception_date date,
  ongoing_charge_pct numeric,
  net_expense_ratio_pct numeric,
  ret_ytd_pct numeric, ret_1y_pct numeric, ret_3y_pct numeric, ret_5y_pct numeric, ret_10y_pct numeric,
  vol_1y_pct numeric, vol_3y_pct numeric, sharpe_3y numeric,
  holdings_count integer,
  holdings_listed integer,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (listing_key, as_of)
);
CREATE INDEX IF NOT EXISTS etf_fund_stats_latest_idx ON etf_fund_stats (listing_key, as_of DESC);

-- Holdings and exposure keep only the latest snapshot per listing; each write replaces the previous one.
CREATE TABLE IF NOT EXISTS etf_holdings (
  listing_key text NOT NULL REFERENCES etf_catalog(listing_key),
  as_of date NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  holding_key text NOT NULL,
  holding_symbol text,
  holding_exchange text,
  name text,
  weight_pct numeric,
  sector text,
  industry text,
  country text,
  region text,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (listing_key, position)
);

CREATE TABLE IF NOT EXISTS etf_exposure (
  listing_key text NOT NULL REFERENCES etf_catalog(listing_key),
  as_of date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('region','sector','mcap','asset','credit')),
  label text NOT NULL,
  weight_pct numeric NOT NULL,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (listing_key, kind, label)
);

CREATE TABLE IF NOT EXISTS etf_dividends (
  vendor_symbol text NOT NULL REFERENCES tracked_assets(vendor_symbol),
  ex_date date NOT NULL,
  amount numeric,
  unadjusted_amount numeric,
  currency text,
  period text,
  declaration_date date,
  record_date date,
  pay_date date,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (vendor_symbol, ex_date)
);
