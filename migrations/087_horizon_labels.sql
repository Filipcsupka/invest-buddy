-- Point-in-time horizon observations and owner overrides. Rows are immutable.
CREATE TABLE horizon_labels (
  id bigserial PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  as_of date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('computed', 'override')),
  profile text NOT NULL CHECK (profile IN ('sustained', 'event_driven', 'mixed', 'no_data')),
  observed_profile text CHECK (observed_profile IN ('sustained', 'event_driven', 'mixed', 'no_data')),
  input_values jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input_values) = 'object'),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasons) = 'array'),
  horizon_rules_version text NOT NULL CHECK (length(trim(horizon_rules_version)) > 0),
  candidate_profile text CHECK (candidate_profile IN ('sustained', 'event_driven', 'mixed', 'no_data')),
  candidate_sessions integer NOT NULL DEFAULT 0 CHECK (candidate_sessions BETWEEN 0 AND 10),
  session_date date,
  override_reason text,
  override_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'computed' AND observed_profile IS NOT NULL AND session_date IS NOT NULL AND override_reason IS NULL AND override_date IS NULL)
      OR (kind = 'override' AND observed_profile IS NULL AND candidate_profile IS NULL AND candidate_sessions = 0 AND session_date IS NULL
          AND override_reason IS NOT NULL AND length(trim(override_reason)) > 0 AND override_date = as_of))
);
CREATE UNIQUE INDEX IF NOT EXISTS horizon_labels_computed_day_idx ON horizon_labels(ticker, as_of) WHERE kind = 'computed';
CREATE INDEX IF NOT EXISTS horizon_labels_latest_idx ON horizon_labels(ticker, as_of DESC, id DESC);
CREATE OR REPLACE FUNCTION horizon_labels_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'horizon_labels is append-only';
END;
$$;
CREATE TRIGGER horizon_labels_no_update_delete BEFORE UPDATE OR DELETE ON horizon_labels
FOR EACH ROW EXECUTE FUNCTION horizon_labels_immutable();
CREATE TRIGGER horizon_labels_no_truncate BEFORE TRUNCATE ON horizon_labels
FOR EACH STATEMENT EXECUTE FUNCTION horizon_labels_immutable();
