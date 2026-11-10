-- Number 137: 135 and 136 are reserved by the auth-core branch.
-- Score page reads without detoasting the full audit. The page-row test (pageScoreRow) and the listing payload read
-- these generated columns; only the company page still reads the full audit, for one row.
-- has_scan_run and has_agreement are the jsonb key tests the pages used to run on every row.
-- listing_audit is the audit with inputs.bars cut to the last 64 sessions (LISTING_BAR_LIMIT in src/data/audit-sql.ts):
-- enough for the heatmap 3m change (63 sessions plus a base) and the scanner floor (20 sessions).
-- Adding stored generated columns rewrites score_results once (about 2,200 rows, 30 MB on 2026-11-10).
-- Rollback: drop the three indexes and the three columns; no other table depends on them.
ALTER TABLE score_results
  ADD COLUMN IF NOT EXISTS has_scan_run boolean GENERATED ALWAYS AS (audit ? 'scanRunId') STORED,
  ADD COLUMN IF NOT EXISTS has_agreement boolean GENERATED ALWAYS AS (audit ? 'agreement') STORED,
  ADD COLUMN IF NOT EXISTS listing_audit jsonb GENERATED ALWAYS AS (
    CASE WHEN jsonb_typeof(audit->'inputs'->'bars') = 'array' AND jsonb_array_length(audit->'inputs'->'bars') > 64
      THEN jsonb_set(audit, '{inputs,bars}', jsonb_path_query_array(audit, 'strict $.inputs.bars[last - 63 to last]'), false)
      ELSE audit END
  ) STORED;

-- Latest page row per ticker (DISTINCT ON (ticker) ORDER BY ticker, as_of DESC), one index per pageScoreRow mode.
CREATE INDEX IF NOT EXISTS score_results_page_public ON score_results (ticker, as_of DESC) WHERE has_scan_run;
CREATE INDEX IF NOT EXISTS score_results_page_private ON score_results (ticker, as_of DESC) WHERE (has_scan_run OR has_agreement);
-- Newest page date (rules streak). Same as migration 086, keyed on the generated column the predicate now uses.
CREATE INDEX IF NOT EXISTS score_results_page_public_as_of ON score_results (as_of DESC) WHERE has_scan_run;
CREATE INDEX IF NOT EXISTS score_results_page_private_as_of ON score_results (as_of DESC) WHERE (has_scan_run OR has_agreement);
