ALTER TABLE consensus_findings DROP CONSTRAINT IF EXISTS consensus_findings_agreement_check;
ALTER TABLE consensus_findings ADD CONSTRAINT consensus_findings_agreement_check
  CHECK (agreement IN ('agree','disputed','single','xbrl_override','verified_single','data_rule','research_verified'));
