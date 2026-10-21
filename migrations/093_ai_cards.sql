CREATE TABLE ai_cards (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  exchange_hint text,
  call_text text NOT NULL,
  call text NOT NULL CHECK (call IN ('START','ADD','WATCH','HOLD','REDUCE','STOP_ADD','OTHER')),
  amount_text text,
  amount_min_eur numeric,
  amount_max_eur numeric,
  card_date date,
  tag text,
  summary text,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_text text,
  price_value numeric,
  price_currency text,
  parent_id bigint REFERENCES ai_cards(id),
  raw_text text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'old-automation',
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_cards_symbol_date_idx ON ai_cards (symbol, card_date DESC, imported_at DESC);
