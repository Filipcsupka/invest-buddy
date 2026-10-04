CREATE TABLE consensus_findings (
  symbol text NOT NULL REFERENCES instruments(ticker),
  field text NOT NULL,
  as_of date NOT NULL,
  value boolean,
  agreement text NOT NULL CHECK (agreement IN ('agree','disputed','single','xbrl_override')),
  agent_values jsonb NOT NULL,
  evidence_refs jsonb NOT NULL,
  verified boolean NOT NULL,
  reason text NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, field, as_of)
);
CREATE INDEX consensus_findings_latest ON consensus_findings (symbol, as_of DESC);
CREATE TABLE reconcile_runs (
  as_of date PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now(),
  field_count integer NOT NULL
);
