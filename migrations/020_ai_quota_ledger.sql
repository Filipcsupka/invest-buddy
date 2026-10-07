ALTER TABLE ai_budget_calls
  ADD COLUMN model text,
  ADD COLUMN agent text CHECK (agent IN ('claude', 'codex')),
  ADD COLUMN auth_source text CHECK (auth_source IN ('subscription', 'api', 'codex')),
  ADD COLUMN status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'ok', 'failed', 'cutoff')),
  ADD COLUMN cutoff_window text,
  ADD COLUMN reset_at timestamptz,
  ADD COLUMN reset_hint text,
  ADD COLUMN input_tokens integer CHECK (input_tokens >= 0),
  ADD COLUMN output_tokens integer CHECK (output_tokens >= 0),
  ADD COLUMN cache_read_tokens integer CHECK (cache_read_tokens >= 0),
  ADD COLUMN cache_creation_tokens integer CHECK (cache_creation_tokens >= 0);

UPDATE ai_budget_calls SET status = 'ok' WHERE completed_at IS NOT NULL;
CREATE INDEX ai_budget_calls_created_at ON ai_budget_calls (created_at DESC);

CREATE TABLE ai_quota_samples (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job text NOT NULL CHECK (job IN ('extract', 'judge')),
  run_id uuid NOT NULL,
  phase text NOT NULL CHECK (phase IN ('start', 'check', 'end')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  five_hour_pct numeric(5,2) NOT NULL CHECK (five_hour_pct BETWEEN 0 AND 100),
  seven_day_pct numeric(5,2) NOT NULL CHECK (seven_day_pct BETWEEN 0 AND 100),
  five_hour_reset_at timestamptz,
  seven_day_reset_at timestamptz
);
CREATE INDEX ai_quota_samples_run ON ai_quota_samples (run_id, observed_at);
