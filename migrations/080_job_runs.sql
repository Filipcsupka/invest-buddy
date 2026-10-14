-- One row per CronJob run, written by runLoggedJob. Kubelet log rotation drops old logs; this keeps the history for the watchdog and the ops report.
-- Additive: one new table. The status is 'running' from the start of the job until it ends.
-- Grants follow the role split (PL19, PL20) once those roles exist; none are set here.
CREATE TABLE IF NOT EXISTS job_runs (
  run_id uuid PRIMARY KEY,
  job text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'ok', 'partial', 'failed')),
  duration_ms integer,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_rss_mb integer
);
CREATE INDEX IF NOT EXISTS job_runs_job_started ON job_runs (job, started_at DESC);
