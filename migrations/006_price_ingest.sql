ALTER TABLE instruments DROP CONSTRAINT instruments_source_check;
ALTER TABLE instruments ADD CONSTRAINT instruments_source_check CHECK (source IN ('guide', 'sample extension', 'benchmark'));
INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('SPY','SPDR S&P 500 ETF','Benchmark',NULL,'benchmark') ON CONFLICT (ticker) DO NOTHING;

CREATE TABLE price_ingest_runs (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  requested_count integer NOT NULL CHECK (requested_count >= 0),
  succeeded_count integer NOT NULL CHECK (succeeded_count >= 0),
  failed_count integer NOT NULL CHECK (failed_count >= 0),
  bars_written integer NOT NULL CHECK (bars_written >= 0),
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  stopped_reason text
);
