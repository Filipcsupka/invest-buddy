-- Keep vendor fundamentals distinct from SEC filings and record when a paid refresh was attempted.
ALTER TABLE fundamentals_pit ADD COLUMN source_id text NOT NULL DEFAULT 'sec' REFERENCES data_sources(id);
CREATE INDEX IF NOT EXISTS fundamentals_pit_source_idx ON fundamentals_pit (ticker, source_id, concept, filed, period_end);

CREATE TABLE IF NOT EXISTS eodhd_fundamentals_refresh (
  ticker text PRIMARY KEY REFERENCES instruments(ticker),
  attempted_at timestamptz NOT NULL,
  latest_report_date date,
  last_expected_report_date date
);

-- A day's calendar can contain observations from both providers.
ALTER TABLE earnings_calendar_snapshots DROP CONSTRAINT earnings_calendar_snapshots_observed_on_ticker_report_date_key;
ALTER TABLE earnings_calendar_snapshots ADD CONSTRAINT earnings_calendar_snapshots_observed_source_key UNIQUE (observed_on, ticker, report_date, source_id);
