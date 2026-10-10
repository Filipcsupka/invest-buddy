-- D8: one ledger of metered API requests per source and UTC day, and a zero default for the monthly cost cap.
-- Additive: a new table and a new index, one metadata-only default change, and an update of a few rows in a 26 row table.
CREATE TABLE IF NOT EXISTS api_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id text NOT NULL REFERENCES data_sources(id),
  day date NOT NULL,
  requests integer NOT NULL CHECK (requests > 0),
  credits numeric(12,2) CHECK (credits >= 0),
  credits_basis text NOT NULL DEFAULT 'unverified' CHECK (credits_basis IN ('verified', 'unverified')),
  est_cost_eur numeric(10,4) NOT NULL DEFAULT 0 CHECK (est_cost_eur >= 0),
  job text NOT NULL DEFAULT 'unknown',
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_usage_source_day ON api_usage (source_id, day);

ALTER TABLE data_sources ALTER COLUMN monthly_cost_cap_eur SET DEFAULT 0;
UPDATE data_sources SET monthly_cost_cap_eur = 0 WHERE monthly_cost_cap_eur IS NULL;
