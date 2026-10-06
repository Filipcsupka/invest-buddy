CREATE TABLE filing_watch (
  cik bigint NOT NULL,
  symbol text NOT NULL,
  accession text NOT NULL CHECK (accession ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  form text NOT NULL,
  items text NOT NULL DEFAULT '',
  filed_at date NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cik, accession)
);
CREATE INDEX filing_watch_symbol_seen ON filing_watch (symbol, first_seen_at DESC);

ALTER TABLE extraction_runs ADD COLUMN cost_usd numeric(10,4) CHECK (cost_usd >= 0);
ALTER TABLE extraction_runs ADD COLUMN accessions text[] NOT NULL DEFAULT '{}';

-- Accounting is retained beyond the 30-day extraction/judge retention window.
CREATE TABLE ai_budget_calls (
  id uuid PRIMARY KEY,
  month date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('extract','judge')),
  reserved_tokens integer NOT NULL CHECK (reserved_tokens >= 0),
  reserved_usd numeric(10,4) NOT NULL CHECK (reserved_usd >= 0),
  used_tokens integer CHECK (used_tokens >= 0),
  used_usd numeric(10,4) CHECK (used_usd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX ai_budget_calls_month ON ai_budget_calls (month);
