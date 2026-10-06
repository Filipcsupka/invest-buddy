-- verified_single: one extractor whose quote matched stored, display-allowed text. data_rule: a deterministic rule on a collected fact (epsBeat from Alpha Vantage).
ALTER TABLE consensus_findings DROP CONSTRAINT IF EXISTS consensus_findings_agreement_check;
ALTER TABLE consensus_findings ADD CONSTRAINT consensus_findings_agreement_check
  CHECK (agreement IN ('agree','disputed','single','xbrl_override','verified_single','data_rule'));
-- Requests to metered APIs per source in one run, e.g. {"alphavantage": 20}. The daily cap sums this over the day's runs.
ALTER TABLE collector_runs ADD COLUMN api_requests jsonb NOT NULL DEFAULT '{}'::jsonb;
