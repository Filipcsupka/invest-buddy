-- D14: keep the inputs behind every score. One row per distinct input fingerprint per ticker and date; rows are never updated or deleted.
-- Additive: new table and indexes only, no change to score_results. reject_record_change() comes from 018.
CREATE TABLE score_input_snapshots (
  id bigserial PRIMARY KEY,
  ticker text NOT NULL,
  as_of date NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  rules_version text NOT NULL,
  inputs_fingerprint text NOT NULL,
  inputs jsonb NOT NULL,
  bars_hash text NOT NULL,
  bar_last_date date,
  UNIQUE (ticker, as_of, inputs_fingerprint)
);
CREATE INDEX score_input_snapshots_recent ON score_input_snapshots (as_of DESC, ticker, observed_at DESC);

CREATE TRIGGER score_input_snapshots_immutable BEFORE UPDATE OR DELETE ON score_input_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_record_change();
CREATE TRIGGER score_input_snapshots_no_truncate BEFORE TRUNCATE ON score_input_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION reject_record_change();
