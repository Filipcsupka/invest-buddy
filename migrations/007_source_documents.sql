CREATE TABLE source_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL,
  symbol text REFERENCES instruments(ticker),
  doc_type text NOT NULL,
  url text NOT NULL UNIQUE CHECK (url LIKE 'https://%'),
  published_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  body text NOT NULL CHECK (octet_length(body) <= 204800),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX source_documents_symbol_published ON source_documents (symbol, published_at DESC);
CREATE INDEX source_documents_expires ON source_documents (expires_at);

CREATE TABLE collected_facts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text NOT NULL REFERENCES instruments(ticker),
  fact_key text NOT NULL,
  as_of date NOT NULL,
  value jsonb NOT NULL,
  document_ids bigint[] NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE (symbol, fact_key, as_of)
);
CREATE INDEX collected_facts_symbol_as_of ON collected_facts (symbol, as_of DESC);
CREATE INDEX collected_facts_expires ON collected_facts (expires_at);

CREATE TABLE collector_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  sources text[] NOT NULL,
  requested_count integer NOT NULL CHECK (requested_count >= 0),
  succeeded_count integer NOT NULL CHECK (succeeded_count >= 0),
  failed_count integer NOT NULL CHECK (failed_count >= 0),
  documents_written integer NOT NULL CHECK (documents_written >= 0),
  facts_written integer NOT NULL CHECK (facts_written >= 0),
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  stopped_reason text
);
