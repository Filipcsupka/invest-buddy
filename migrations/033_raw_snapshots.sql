-- D17: raw response store. One row per distinct response body per (source, key); no expiry.
-- Additive: a new table and its index only.
CREATE TABLE IF NOT EXISTS raw_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id text NOT NULL REFERENCES data_sources(id),
  key text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  body bytea NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_id, key, content_hash)
);

-- body is gzip already, so skip the second compression attempt in TOAST.
ALTER TABLE raw_snapshots ALTER COLUMN body SET STORAGE EXTERNAL;

CREATE INDEX IF NOT EXISTS raw_snapshots_source_key_fetched ON raw_snapshots (source_id, key, fetched_at DESC);
