-- Number 142 (assigned for the index data lane).
-- Weekly index snapshots: the vendor fundamentals `General` block of each tracked index, stored with the date of the
-- request and the coverage of the constituent list written the same day (index_components, migration 120).
-- One fundamentals request with filter=General,Components is billed as 10 calls; 25 indices make 250 a week.
-- Rows keep display_allowed from canDisplay("eodhd") at write time (currently false).
-- Additive and idempotent: new tables and an index only. Rollback: drop index_snapshot_refresh and index_snapshots.
CREATE TABLE IF NOT EXISTS index_snapshots (
  index_symbol text NOT NULL REFERENCES tracked_assets(vendor_symbol),
  as_of date NOT NULL,
  general jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(general) = 'object'),
  name text,
  currency text,
  country text,
  component_count integer NOT NULL DEFAULT 0 CHECK (component_count >= 0),
  weighted_count integer NOT NULL DEFAULT 0 CHECK (weighted_count >= 0 AND weighted_count <= component_count),
  weight_sum numeric CHECK (weight_sum IS NULL OR weight_sum >= 0),
  request_filter text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id),
  display_allowed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (index_symbol, as_of)
);
CREATE INDEX IF NOT EXISTS index_snapshots_latest ON index_snapshots(index_symbol, as_of DESC);

-- Last attempt per index, so the weekly job retries an index only after its stale window, whatever the outcome.
CREATE TABLE IF NOT EXISTS index_snapshot_refresh (
  index_symbol text PRIMARY KEY REFERENCES tracked_assets(vendor_symbol),
  attempted_at timestamptz NOT NULL,
  component_count integer NOT NULL DEFAULT 0 CHECK (component_count >= 0),
  status text NOT NULL CHECK (status IN ('ok','empty','failed'))
);
