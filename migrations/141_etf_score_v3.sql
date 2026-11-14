-- Allow the 100-point ETF rating while retaining the historical v2 rows.
ALTER TABLE etf_scores DROP CONSTRAINT IF EXISTS etf_scores_earned_check;
ALTER TABLE etf_scores DROP CONSTRAINT IF EXISTS etf_scores_evidenced_max_check;
ALTER TABLE etf_scores ADD CONSTRAINT etf_scores_earned_check CHECK (earned BETWEEN 0 AND 100);
ALTER TABLE etf_scores ADD CONSTRAINT etf_scores_evidenced_max_check CHECK (evidenced_max BETWEEN 0 AND 100);
-- Rule values, thresholds, dates and gap reasons remain in rule_hits JSONB.
-- Rollback: restore both upper bounds to 35 after removing v3 rows.
