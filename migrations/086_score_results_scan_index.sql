-- Rules-streak scanner read: newest scan snapshot and its window, without scanning every score_results row. Index only.
CREATE INDEX IF NOT EXISTS score_results_scan_as_of ON score_results (as_of DESC) WHERE audit ? 'scanRunId';
