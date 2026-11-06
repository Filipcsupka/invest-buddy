-- Owner-only macro and flow views from EODHD: economic events, Treasury rates, World Bank indicators, congressional trades, news and daily sentiment.
-- Every row keeps source_id and the display flag computed with canDisplay("eodhd") at write time (false while the licence is unsettled).
-- Beta endpoints (Treasury rates, congressional trades) also keep the vendor row as raw jsonb so a schema change can be replayed.

CREATE TABLE IF NOT EXISTS economic_events (
  event_key text PRIMARY KEY,
  country text NOT NULL,
  event_type text NOT NULL,
  comparison text,
  period text,
  -- The vendor sends "YYYY-MM-DD HH:MM:SS" without a zone; US release times matched UTC on 2026-11-06.
  event_at timestamptz NOT NULL,
  actual numeric,
  previous numeric,
  estimate numeric,
  change numeric,
  change_pct numeric,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS economic_events_at_idx ON economic_events (event_at);
CREATE INDEX IF NOT EXISTS economic_events_country_at_idx ON economic_events (country, event_at);

CREATE TABLE IF NOT EXISTS ust_rates (
  curve text NOT NULL CHECK (curve IN ('bill', 'long-term', 'yield', 'real-yield')),
  obs_date date NOT NULL,
  -- tenor for bill, yield and real-yield rows; rate_type (BC_20year, Over_10_Years, Real_Rate) for long-term rows.
  tenor text NOT NULL,
  -- rate for yield, real-yield and long-term rows; the coupon-equivalent rate for bill rows.
  rate numeric,
  raw jsonb NOT NULL,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (curve, obs_date, tenor)
);
CREATE INDEX IF NOT EXISTS ust_rates_recent_idx ON ust_rates (curve, obs_date DESC);

CREATE TABLE IF NOT EXISTS macro_indicators (
  country text NOT NULL,
  indicator text NOT NULL,
  obs_date date NOT NULL,
  value numeric,
  country_name text,
  indicator_name text,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (country, indicator, obs_date)
);

CREATE TABLE IF NOT EXISTS congress_trades (
  trade_key text PRIMARY KEY,
  filing_id text NOT NULL,
  chamber text NOT NULL CHECK (chamber IN ('house', 'senate')),
  bioguide_id text,
  member_name text NOT NULL,
  state text,
  district integer,
  party text,
  symbol text,
  asset_description text,
  asset_type text,
  tx_type text,
  owner text,
  -- Null when the filed date is not a real date (the vendor feed carries mistyped years such as 3031).
  tx_date date,
  disclosure_date date NOT NULL,
  amount_range text,
  amount_low numeric,
  amount_high numeric,
  days_to_disclose integer,
  is_late boolean,
  comment text,
  filing_url text,
  raw jsonb NOT NULL,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS congress_trades_disclosed_idx ON congress_trades (disclosure_date DESC, tx_date DESC);
CREATE INDEX IF NOT EXISTS congress_trades_symbol_idx ON congress_trades (symbol, disclosure_date DESC);
CREATE INDEX IF NOT EXISTS congress_trades_member_idx ON congress_trades (bioguide_id, disclosure_date DESC);

-- Headline, link, tickers, tags and the vendor's sentiment scores. The article body is never stored.
CREATE TABLE IF NOT EXISTS news_items (
  link text PRIMARY KEY,
  published_at timestamptz NOT NULL,
  title text NOT NULL,
  symbols text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  polarity numeric,
  neg numeric,
  neu numeric,
  pos numeric,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_items_published_idx ON news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_symbols_idx ON news_items USING gin (symbols);
CREATE INDEX IF NOT EXISTS news_items_tags_idx ON news_items USING gin (tags);

-- Daily vendor sentiment per EODHD symbol (count of articles and the normalized score from -1 to 1).
CREATE TABLE IF NOT EXISTS sentiment_daily (
  symbol text NOT NULL,
  obs_date date NOT NULL,
  score numeric NOT NULL,
  article_count integer,
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, obs_date)
);

-- Last sentiment request per symbol, so a capped run continues with the symbols that waited longest.
CREATE TABLE IF NOT EXISTS sentiment_fetches (
  symbol text PRIMARY KEY,
  fetched_at timestamptz NOT NULL
);
