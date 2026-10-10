-- D34: resume point for long, rate-limited history pulls (src/jobs/backfill.ts), one row per job and subject.
-- Additive: one new table, no change to existing tables.
CREATE TABLE IF NOT EXISTS backfill_state (
  job text NOT NULL,
  subject text NOT NULL,
  cursor jsonb,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'done', 'failed')),
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job, subject)
);
