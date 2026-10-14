-- One stored outcome per signal and window, written the day the window completes. Inserted once, never changed.
CREATE TABLE record_outcomes (
  signal_id bigint NOT NULL REFERENCES record_signals(id),
  window_days smallint NOT NULL CHECK (window_days IN (1, 5, 20, 60)),
  exit_date date NOT NULL,
  stock_return numeric NOT NULL,
  spy_return numeric NOT NULL,
  excess_return numeric NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_id, window_days)
);
CREATE INDEX record_outcomes_excess ON record_outcomes (excess_return);
CREATE TRIGGER record_outcomes_immutable BEFORE UPDATE OR DELETE ON record_outcomes
  FOR EACH ROW EXECUTE FUNCTION reject_record_change();
