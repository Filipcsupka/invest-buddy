-- D27: one row per ticker and expected report date seen on each day's Alpha Vantage calendar pull. Append-only.
-- Additive: a new table, its index and triggers.
CREATE TABLE earnings_calendar_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observed_at timestamptz NOT NULL DEFAULT now(),
  observed_on date NOT NULL,
  ticker text NOT NULL REFERENCES instruments(ticker),
  report_date date NOT NULL,
  fiscal_date_ending date,
  estimate numeric,
  currency text,
  time_of_day text,
  source_id text NOT NULL REFERENCES data_sources(id),
  raw_snapshot_id bigint REFERENCES raw_snapshots(id),
  UNIQUE (observed_on, ticker, report_date)
);
CREATE INDEX earnings_calendar_snapshots_ticker_idx ON earnings_calendar_snapshots (ticker, observed_on DESC);

CREATE TRIGGER earnings_calendar_snapshots_immutable BEFORE UPDATE OR DELETE ON earnings_calendar_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_record_change();
CREATE TRIGGER earnings_calendar_snapshots_no_truncate BEFORE TRUNCATE ON earnings_calendar_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION reject_record_change();
