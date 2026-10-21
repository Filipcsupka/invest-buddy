ALTER TABLE insider_transactions
  ADD COLUMN source_id text NOT NULL DEFAULT 'sec' REFERENCES data_sources(id),
  ADD COLUMN first_observed_at timestamptz;

-- Legacy SEC rows have no trustworthy observation timestamp. New rows record one.
ALTER TABLE insider_transactions ALTER COLUMN first_observed_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS insider_transactions_source_observed_idx
  ON insider_transactions (ticker, source_id, first_observed_at);

CREATE TABLE IF NOT EXISTS eodhd_insider_refresh (
  ticker text PRIMARY KEY REFERENCES instruments(ticker),
  attempted_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sec_insider_refresh (
  ticker text PRIMARY KEY REFERENCES instruments(ticker),
  checked_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION insider_net_buy(p_ticker text, p_as_of date, p_window integer)
RETURNS TABLE(net_shares numeric, net_dollars numeric, dollars_complete boolean)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(CASE code WHEN 'P' THEN shares ELSE -shares END),0),
         COALESCE(sum(CASE code WHEN 'P' THEN shares * price ELSE -shares * price END),0),
         count(*) FILTER (WHERE price IS NULL) = 0
  FROM insider_transactions
  WHERE ticker=p_ticker AND filed_at<=p_as_of AND filed_at>=p_as_of-p_window
    AND transaction_date<=p_as_of AND transaction_date>=p_as_of-p_window
    AND (first_observed_at IS NULL OR (first_observed_at AT TIME ZONE 'UTC')::date <= p_as_of)
    AND code IN ('P','S') AND NOT derivative;
$$;
