CREATE TABLE instruments (
  ticker text PRIMARY KEY,
  name text NOT NULL,
  sector text NOT NULL,
  tier smallint CHECK (tier BETWEEN 1 AND 3),
  source text NOT NULL CHECK (source IN ('guide', 'sample extension'))
);

CREATE TABLE daily_bars (
  ticker text NOT NULL REFERENCES instruments(ticker),
  bar_date date NOT NULL,
  open numeric NOT NULL CHECK (open > 0),
  high numeric NOT NULL CHECK (high > 0),
  low numeric NOT NULL CHECK (low > 0),
  close numeric NOT NULL CHECK (close > 0),
  volume numeric NOT NULL CHECK (volume >= 0),
  PRIMARY KEY (ticker, bar_date),
  CHECK (high >= low AND open BETWEEN low AND high AND close BETWEEN low AND high)
);

CREATE TABLE fundamentals_snapshots (
  ticker text NOT NULL REFERENCES instruments(ticker),
  as_of date NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (ticker, as_of)
);

CREATE TABLE macro_snapshots (
  ticker text NOT NULL REFERENCES instruments(ticker),
  as_of date NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (ticker, as_of)
);

CREATE TABLE score_results (
  ticker text NOT NULL REFERENCES instruments(ticker),
  as_of date NOT NULL,
  technical smallint NOT NULL,
  fundamentals smallint NOT NULL,
  macro smallint NOT NULL,
  total smallint NOT NULL,
  state text NOT NULL,
  audit jsonb NOT NULL,
  PRIMARY KEY (ticker, as_of)
);
CREATE INDEX score_results_history ON score_results (ticker, as_of DESC);

CREATE TABLE alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  as_of date NOT NULL,
  previous_state text,
  current_state text NOT NULL,
  previous_score smallint,
  current_score smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticker, as_of),
  FOREIGN KEY (ticker, as_of) REFERENCES score_results(ticker, as_of)
);
CREATE INDEX alerts_by_date ON alerts (as_of DESC, ticker);

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'sk')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  status text NOT NULL,
  provider_ref text UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);
CREATE INDEX subscriptions_by_user ON subscriptions (user_id, status);

CREATE TABLE ingest_runs (
  as_of date PRIMARY KEY,
  provider text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  instrument_count integer NOT NULL CHECK (instrument_count >= 0),
  alert_count integer NOT NULL CHECK (alert_count >= 0)
);
