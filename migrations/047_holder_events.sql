-- D21: retain universe 13D/13G filings by accession without expiry.
CREATE TABLE holder_events (
  accession text PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  filer_name text,
  filer_cik bigint,
  form text NOT NULL CHECK (form IN ('SCHEDULE 13D','SCHEDULE 13D/A','SCHEDULE 13G','SCHEDULE 13G/A')),
  filed_at date NOT NULL,
  percent numeric CHECK (percent >= 0 AND percent <= 100),
  shares numeric CHECK (shares >= 0),
  source_id text NOT NULL DEFAULT 'sec' REFERENCES data_sources(id)
);
CREATE INDEX holder_events_ticker_filed_idx ON holder_events(ticker,filed_at DESC);
