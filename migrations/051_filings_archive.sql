-- D19: SEC filing text archive, no expiry. One row per file of a filing (primary document or exhibit).
-- The body lives in raw_snapshots (D17, gzip); this table is the index with provenance. Additive: one table and two indexes.
CREATE TABLE IF NOT EXISTS filings (
  accession text NOT NULL,
  doc_name text NOT NULL,
  ticker text NOT NULL REFERENCES instruments(ticker),
  cik bigint NOT NULL,
  form text NOT NULL,
  doc_type text NOT NULL,
  items text NOT NULL DEFAULT '',
  filed_at date NOT NULL,
  primary_doc_url text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  content_hash text NOT NULL,
  snapshot_id bigint NOT NULL REFERENCES raw_snapshots(id),
  source_id text NOT NULL REFERENCES data_sources(id),
  licence_class text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (accession, doc_name)
);
CREATE INDEX IF NOT EXISTS filings_ticker_filed ON filings (ticker, filed_at DESC);
CREATE INDEX IF NOT EXISTS filings_form_filed ON filings (form, filed_at DESC);
