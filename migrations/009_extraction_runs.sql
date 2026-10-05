CREATE TABLE extraction_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text NOT NULL REFERENCES instruments(ticker),
  as_of date NOT NULL,
  agent text NOT NULL CHECK (agent IN ('claude','codex')),
  model text NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('pending','ok','failed','skipped')),
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  cache_read_tokens integer CHECK (cache_read_tokens >= 0),
  cache_creation_tokens integer CHECK (cache_creation_tokens >= 0),
  turns integer CHECK (turns >= 0),
  output jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE (symbol, as_of, agent, input_hash)
);
CREATE INDEX extraction_runs_symbol_created ON extraction_runs (symbol, created_at DESC);
CREATE INDEX extraction_runs_expires ON extraction_runs (expires_at);

-- Set only on rows copied forward by reconcile when CARRY_FORWARD=on. The date is the scan the value came from.
ALTER TABLE consensus_findings ADD COLUMN carried_from date;
