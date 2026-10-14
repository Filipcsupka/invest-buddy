-- D28: every quarter Alpha Vantage EARNINGS returns, with the estimate as seen on each fetch. Append-only.
-- A new row is written only when a value for the quarter differs from the newest stored row, so a revised estimate adds a row and the old row stays.
CREATE TABLE eps_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  fiscal_date_ending date NOT NULL,
  reported_date date,
  reported_eps numeric,
  estimated_eps numeric,
  surprise_pct numeric,
  observed_at timestamptz NOT NULL DEFAULT now(),
  source_id text NOT NULL REFERENCES data_sources(id),
  raw_snapshot_id bigint REFERENCES raw_snapshots(id),
  UNIQUE (ticker, fiscal_date_ending, observed_at)
);
CREATE INDEX eps_history_ticker_idx ON eps_history (ticker, fiscal_date_ending DESC, observed_at DESC);

CREATE TRIGGER eps_history_immutable BEFORE UPDATE OR DELETE ON eps_history
  FOR EACH ROW EXECUTE FUNCTION reject_record_change();
CREATE TRIGGER eps_history_no_truncate BEFORE TRUNCATE ON eps_history
  FOR EACH STATEMENT EXECUTE FUNCTION reject_record_change();
