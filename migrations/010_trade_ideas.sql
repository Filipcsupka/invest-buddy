-- Phase C, judge step. One AI call per run turns reconciled facts into trade ideas; a script validates and stores them.
--
-- judge_runs is its own table. extraction_runs is keyed per symbol (symbol NOT NULL, FK to instruments, unique per symbol),
-- while one judge call covers the whole universe and the portfolio, so the shape does not fit. The columns for tokens,
-- status and hash follow extraction_runs on purpose so the two read the same.
CREATE TABLE judge_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  cost_usd numeric(10,4) CHECK (cost_usd >= 0),
  rule_config_version text,
  idea_count integer CHECK (idea_count >= 0),
  stored_count integer CHECK (stored_count >= 0),
  output jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE (as_of, agent, input_hash)
);
CREATE INDEX judge_runs_expires ON judge_runs (expires_at);

-- One row per stored idea. Only ideas whose deterministic signal changed are stored (see signature), so this is an alert log, not a daily snapshot.
-- Action, amount band and the three ratings come from src/engine/signals.ts. The AI only writes the wording.
-- symbol is not a foreign key: CSPX_ALLOCATION ideas use the symbol CSPX, and a held name may sit outside the universe.
CREATE TABLE trade_ideas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  as_of date NOT NULL,
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9.]{1,10}$'),
  action text NOT NULL CHECK (action IN ('WATCH','START_POSITION','ADD','HIGH_CONVICTION_ADD','HOLD','REDUCE','THESIS_BROKEN','CSPX_ALLOCATION')),
  amount_min_eur numeric(12,2) NOT NULL CHECK (amount_min_eur >= 0),
  amount_max_eur numeric(12,2) NOT NULL CHECK (amount_max_eur >= amount_min_eur),
  verdict text NOT NULL,
  what_happened jsonb NOT NULL,
  why_it_matters jsonb NOT NULL,
  setup jsonb NOT NULL,     -- {company, entry, catalyst}: Very strong | Strong | Good | Neutral | Weak
  numbers jsonb NOT NULL,   -- 3 to 5 items {label, value}
  plan jsonb NOT NULL,      -- {amountNow, trigger, invalidation, opportunityCost}
  evidence_urls jsonb NOT NULL, -- [{url, label}], every url comes from the judge input
  unconfirmed boolean NOT NULL DEFAULT false,
  carried_from date,        -- set by the script when the idea rests on carried-forward data; null means fresh
  signature text NOT NULL,  -- deterministic signal: action|company|entry|catalyst|min-max, compared with the previous idea for the symbol
  rule_config_version text NOT NULL, -- SIGNAL_RULES.version that produced the action, band and ratings
  conflict_note text,       -- set when the judge flagged a conflict between the rules and the evidence, with its reason
  downgraded_from text CHECK (downgraded_from IN ('WATCH','START_POSITION','ADD','HIGH_CONVICTION_ADD','HOLD','REDUCE','THESIS_BROKEN','CSPX_ALLOCATION')), -- the judge may only downgrade to WATCH EUR 0
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  agent text NOT NULL CHECK (agent IN ('claude','codex')),
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  UNIQUE (as_of, symbol, input_hash)
);
CREATE INDEX trade_ideas_recent ON trade_ideas (as_of DESC, id DESC);
CREATE INDEX trade_ideas_symbol ON trade_ideas (symbol, as_of DESC, id DESC);
CREATE INDEX trade_ideas_expires ON trade_ideas (expires_at);

-- Portfolio baseline the judge reads: positions and cash. Filled by hand (POST /api/ingest/portfolio-baseline) today;
-- an interactive IBKR MCP session can write the same shape later. The newest row on or before the judge date wins.
-- Personal data: never public, never part of the published portfolio snapshot.
CREATE TABLE portfolio_baseline (
  as_of date PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('manual','ibkr-mcp')),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  cash_eur numeric(14,2) NOT NULL CHECK (cash_eur >= 0),
  monthly_contribution_eur numeric(12,2) CHECK (monthly_contribution_eur >= 0),
  positions jsonb NOT NULL,  -- [{symbol, quantity?, valueEur, costEur?}]
  created_at timestamptz NOT NULL DEFAULT now()
);
