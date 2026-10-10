-- D15: keep the old row whenever a consensus finding is replaced or deleted. Additive: new table, new trigger, live table untouched.
-- No CHECK or foreign key copied from the live table, so history never blocks a write and never goes stale when the agreement list changes.
CREATE TABLE consensus_findings_history (LIKE consensus_findings);
ALTER TABLE consensus_findings_history
  ADD COLUMN id bigserial PRIMARY KEY,
  ADD COLUMN superseded_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX consensus_findings_history_key ON consensus_findings_history (symbol, field, as_of, superseded_at);

CREATE FUNCTION consensus_to_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO consensus_findings_history
    (symbol, field, as_of, value, agreement, agent_values, evidence_refs, verified, reason, reconciled_at, carried_from, superseded_at)
  VALUES
    (OLD.symbol, OLD.field, OLD.as_of, OLD.value, OLD.agreement, OLD.agent_values, OLD.evidence_refs, OLD.verified, OLD.reason, OLD.reconciled_at, OLD.carried_from, now());
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER consensus_findings_keep BEFORE UPDATE OR DELETE ON consensus_findings
  FOR EACH ROW EXECUTE FUNCTION consensus_to_history();

-- History is append-only (docs/adr-point-in-time.md section 4); reject_record_change() comes from 018.
CREATE TRIGGER consensus_findings_history_immutable BEFORE UPDATE OR DELETE ON consensus_findings_history
  FOR EACH ROW EXECUTE FUNCTION reject_record_change();
CREATE TRIGGER consensus_findings_history_no_truncate BEFORE TRUNCATE ON consensus_findings_history
  FOR EACH STATEMENT EXECUTE FUNCTION reject_record_change();
