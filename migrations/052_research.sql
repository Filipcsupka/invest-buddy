-- RS3: durable research runs, facts, candidate memory and events.
ALTER TABLE ai_budget_calls DROP CONSTRAINT ai_budget_calls_kind_check;
ALTER TABLE ai_budget_calls ADD CONSTRAINT ai_budget_calls_kind_check CHECK (kind IN ('extract','judge','research'));
ALTER TABLE ai_quota_samples DROP CONSTRAINT ai_quota_samples_job_check;
ALTER TABLE ai_quota_samples ADD CONSTRAINT ai_quota_samples_job_check CHECK (job IN ('extract','judge','research'));
INSERT INTO data_sources (id,name,kind,licence_class,display_allowed,redistribution_allowed,notes)
VALUES ('research_web','Research web pages','news','unknown',false,false,'Internal quote verification only; display and redistribution are disabled.')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE research_runs (
  id uuid PRIMARY KEY,
  run_type text NOT NULL CHECK (run_type IN ('weekly_discovery','daily_watch','deep_dive')),
  as_of date NOT NULL, started_at timestamptz, finished_at timestamptz,
  adapter text NOT NULL CHECK (adapter IN ('claude','codex')), model text, auth_source text, prompt_version text,
  status text NOT NULL CHECK (status IN ('ok','partial','cutoff','failed','killed','skipped_cap','skipped_quota','skipped_window')),
  stop_reason text, input_tokens int CHECK (input_tokens>=0), output_tokens int CHECK (output_tokens>=0),
  cache_read_tokens int CHECK (cache_read_tokens>=0), cache_creation_tokens int CHECK (cache_creation_tokens>=0),
  web_searches int CHECK (web_searches>=0), web_fetches int CHECK (web_fetches>=0),
  cost_usd numeric(10,4) CHECK (cost_usd>=0), duration_s numeric CHECK (duration_s>=0),
  findings_count int NOT NULL DEFAULT 0 CHECK (findings_count>=0),
  verified_count int NOT NULL DEFAULT 0 CHECK (verified_count>=0),
  dropped_count int NOT NULL DEFAULT 0 CHECK (dropped_count>=0),
  ai_budget_call_id uuid REFERENCES ai_budget_calls(id), output_hash text, model_output jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_runs_date_idx ON research_runs(as_of DESC);

CREATE TABLE research_findings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES research_runs(id), finding_key text NOT NULL,
  symbol text NOT NULL, company_name text NOT NULL, exchange text,
  kind text NOT NULL, field text, polarity text NOT NULL,
  claim text NOT NULL, event_date date, themes text[] NOT NULL DEFAULT '{}',
  confidence text NOT NULL, lead boolean NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='array'),
  figures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(figures)='array'),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','quote_not_found','fetch_failed','blocked','stale','lead_only')),
  source_class text, source_id text REFERENCES data_sources(id),
  snapshot_id bigint REFERENCES raw_snapshots(id), document_id bigint,
  confirmed boolean NOT NULL DEFAULT false, reading_label text,
  display_quote boolean NOT NULL DEFAULT false, verified_at timestamptz,
  dedupe_key text NOT NULL,
  UNIQUE(run_id,finding_key)
);
CREATE INDEX research_findings_pending_idx ON research_findings(id) WHERE verification_status='pending';
CREATE INDEX research_findings_symbol_idx ON research_findings(symbol,verified_at DESC);
CREATE INDEX research_findings_dedupe_idx ON research_findings(dedupe_key);

CREATE TABLE research_candidates (
  symbol text PRIMARY KEY, company_name text NOT NULL, exchange text, themes text[] NOT NULL DEFAULT '{}',
  state text NOT NULL CHECK (state IN ('DISCOVERED','WATCH','START_READY','ADD_READY','HOLD','REDUCE','BROKEN','DROPPED')),
  state_since date NOT NULL, previous_state text,
  first_seen_at timestamptz NOT NULL DEFAULT now(), first_run_id uuid REFERENCES research_runs(id),
  last_verified_at timestamptz, last_checked_at timestamptz, last_screened_at timestamptz, review_at date NOT NULL,
  in_universe boolean NOT NULL DEFAULT false, scorable boolean NOT NULL DEFAULT false,
  promotion_status text NOT NULL DEFAULT 'none' CHECK (promotion_status IN ('none','proposed','approved','rejected')),
  thesis text NOT NULL DEFAULT '', upgrade_triggers jsonb NOT NULL DEFAULT '[]'::jsonb,
  invalidation jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_alert jsonb, last_alert_at timestamptz, owner_note text
);
CREATE INDEX research_candidates_review_idx ON research_candidates(review_at,state);

CREATE TABLE research_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  symbol text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('discovered','finding_verified','finding_dropped','state_change','review_due','promotion_proposed','promoted','alert_sent','alert_suppressed','deep_dive','owner_note')),
  from_state text, to_state text, reason text, finding_ids bigint[] NOT NULL DEFAULT '{}',
  run_id uuid REFERENCES research_runs(id), payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX research_events_symbol_idx ON research_events(symbol,at DESC);
