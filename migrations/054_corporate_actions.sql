-- D13: record of splits and other corporate actions. Additive: one new table, one notes update.
CREATE TABLE corporate_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  action_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('split', 'reverse_split', 'dividend', 'spinoff', 'symbol_change')),
  -- new shares per old share: 4 for a 4:1 split, 0.1 for a 1:10 reverse split. Null for kinds without a ratio.
  ratio numeric CHECK (ratio IS NULL OR ratio > 0),
  amount numeric CHECK (amount IS NULL OR amount >= 0),
  source_id text NOT NULL REFERENCES data_sources(id),
  detected_by text NOT NULL CHECK (detected_by IN ('vendor', 'heuristic')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, action_date, kind)
);
CREATE INDEX corporate_actions_ticker_date ON corporate_actions (ticker, action_date DESC);

UPDATE data_sources SET notes = notes || ' Splits endpoint: plan availability and credit cost not verified (docs page did not state it when read on 2026-10-14); no vendor adapter built. Splits are detected from stored bars.' WHERE id = 'twelvedata';
