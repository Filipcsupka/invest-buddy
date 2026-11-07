-- A completed private EODHD candidate can be skipped on the next seed run.
CREATE TABLE eodhd_universe_seed (
  vendor_symbol text PRIMARY KEY REFERENCES symbols(vendor_symbol),
  seeded_at timestamptz NOT NULL DEFAULT now(),
  last_bar_date date NOT NULL,
  bar_count integer NOT NULL CHECK (bar_count > 0),
  fact_count integer NOT NULL CHECK (fact_count > 0)
);
