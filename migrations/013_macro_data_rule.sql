-- The macro job (src/jobs/macro.ts) stores deterministic macro flags with agreement 'data_rule'.
ALTER TABLE consensus_findings DROP CONSTRAINT IF EXISTS consensus_findings_agreement_check;
ALTER TABLE consensus_findings ADD CONSTRAINT consensus_findings_agreement_check CHECK (agreement IN ('agree','disputed','single','xbrl_override','data_rule'));
