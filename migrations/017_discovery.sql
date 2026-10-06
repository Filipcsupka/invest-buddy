ALTER TABLE instruments DROP CONSTRAINT instruments_source_check;
ALTER TABLE instruments ADD CONSTRAINT instruments_source_check CHECK (source IN ('guide', 'sample extension', 'benchmark', 'discovery'));
INSERT INTO instruments (ticker,name,sector,tier,source)
VALUES ('PCVX','Vaxcyte','Biotech',NULL,'discovery')
ON CONFLICT (ticker) DO NOTHING;

CREATE TABLE discovery_candidates (
  week_start date NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL,
  sector text NOT NULL,
  theme text,
  score integer NOT NULL,
  rule_score integer NOT NULL,
  rule_state text NOT NULL,
  signal_date date NOT NULL,
  benchmark_close numeric,
  sources jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  PRIMARY KEY (week_start,symbol)
);
CREATE INDEX discovery_candidates_status ON discovery_candidates (status,week_start DESC);

-- Marketwide shortlist prices are private and are not yet ordinary instruments.
CREATE TABLE discovery_price_bars (
  symbol text NOT NULL,
  name text NOT NULL,
  sector text NOT NULL,
  bar_date date NOT NULL,
  open numeric NOT NULL CHECK (open > 0),
  high numeric NOT NULL CHECK (high > 0),
  low numeric NOT NULL CHECK (low > 0),
  close numeric NOT NULL CHECK (close > 0),
  volume numeric NOT NULL CHECK (volume >= 0),
  PRIMARY KEY (symbol,bar_date),
  CHECK (high >= low AND open BETWEEN low AND high AND close BETWEEN low AND high)
);
CREATE INDEX discovery_price_bars_date ON discovery_price_bars (bar_date DESC);
