-- P1: scheduled US macro releases (BLS CPI, PPI, jobs report; FOMC decision day), refreshed by the macro-calendar job.
-- Additive: a new table and its index. The job replaces the future rows of a kind only after that kind's page was read.
CREATE TABLE IF NOT EXISTS macro_events (
  kind text NOT NULL CHECK (kind IN ('CPI', 'PPI', 'NFP', 'FOMC')),
  event_date date NOT NULL,
  label text NOT NULL,
  reference_period text,
  release_time text,
  source_id text NOT NULL REFERENCES data_sources(id),
  source_url text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, event_date)
);
CREATE INDEX IF NOT EXISTS macro_events_date_idx ON macro_events (event_date);
