-- D22: quarterly 13F-HR holdings of tracked institutions for universe tickers, kept without expiry.
CREATE TABLE institutional_filings (
  period date NOT NULL,
  filer_cik bigint NOT NULL,
  filer_name text NOT NULL,
  accession text NOT NULL,
  source_id text NOT NULL DEFAULT 'sec' REFERENCES data_sources(id),
  PRIMARY KEY (period, filer_cik)
);
CREATE TABLE institutional_holdings (
  period date NOT NULL,
  filer_cik bigint NOT NULL,
  filer_name text NOT NULL,
  ticker text NOT NULL REFERENCES instruments(ticker),
  shares numeric NOT NULL CHECK (shares >= 0),
  value_usd numeric NOT NULL CHECK (value_usd >= 0),
  -- shares minus the same filer's shares in its previous stored quarter; NULL when that filer has no earlier stored filing.
  change_shares numeric,
  prior_period date,
  PRIMARY KEY (period, filer_cik, ticker),
  FOREIGN KEY (period, filer_cik) REFERENCES institutional_filings(period, filer_cik)
);
CREATE INDEX institutional_holdings_ticker_idx ON institutional_holdings(ticker, period DESC);
