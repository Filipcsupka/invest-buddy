-- D16: results of the data quality checks, one row per check, subject and day.
-- Additive: one new table and one index, no change to existing tables.
CREATE TABLE IF NOT EXISTS dq_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  check_id text NOT NULL,
  subject text NOT NULL,
  as_of date NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (check_id, subject, as_of)
);

CREATE INDEX IF NOT EXISTS dq_results_as_of_status ON dq_results (as_of, status);
