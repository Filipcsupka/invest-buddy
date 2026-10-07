-- Historical observations are inserted once. Replaying a run does not rewrite what was first published.
CREATE TABLE record_snapshots (
  ticker text NOT NULL REFERENCES instruments(ticker),
  as_of date NOT NULL,
  score smallint NOT NULL,
  state text NOT NULL,
  rule_hits jsonb NOT NULL,
  rules_version text,
  reference_close numeric CHECK (reference_close > 0),
  PRIMARY KEY (ticker, as_of)
);
CREATE INDEX record_snapshots_recent ON record_snapshots (as_of DESC, ticker);

-- New judge invocations have a UUID; older ideas fall back to agent:inputHash when backfilled.
ALTER TABLE trade_ideas ADD COLUMN judge_run_id uuid;

-- Every distinct judge invocation is retained, including repeated same-day outcomes and forced reruns.
CREATE TABLE record_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  as_of date NOT NULL,
  source text NOT NULL CHECK (source IN ('score', 'judge')),
  event_key text NOT NULL,
  tier text NOT NULL,
  state text NOT NULL,
  score smallint,
  rules_version text,
  reference_close numeric CHECK (reference_close > 0),
  spy_reference_close numeric CHECK (spy_reference_close > 0),
  UNIQUE (ticker, as_of, source, event_key)
);
CREATE INDEX record_signals_recent ON record_signals (as_of DESC, id DESC);

CREATE FUNCTION reject_record_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Track record rows are immutable';
END;
$$;
CREATE TRIGGER record_snapshots_immutable BEFORE UPDATE OR DELETE ON record_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_record_change();
CREATE TRIGGER record_signals_immutable BEFORE UPDATE OR DELETE ON record_signals
  FOR EACH ROW EXECUTE FUNCTION reject_record_change();
