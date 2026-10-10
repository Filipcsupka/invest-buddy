-- Security master: one current row per ticker, older rows kept with valid_to set.
-- Additive: new table and index only. CIK, SIC and the other ids are filled by scripts/master-refresh.ts.
CREATE TABLE IF NOT EXISTS instrument_ids (
  id bigserial PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  instrument_type text NOT NULL DEFAULT 'equity' CHECK (instrument_type IN ('equity', 'etf')),
  cik bigint CHECK (cik > 0),
  figi text,
  composite_figi text,
  exchange text,
  currency text,
  sic text,
  sic_description text,
  fiscal_year_end text CHECK (fiscal_year_end ~ '^[0-9]{4}$'),
  state_of_incorporation text,
  vendor_symbols jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(vendor_symbols) = 'object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  valid_from date NOT NULL,
  valid_to date,
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS instrument_ids_current_idx ON instrument_ids (ticker) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS instrument_ids_cik_idx ON instrument_ids (cik) WHERE cik IS NOT NULL;

-- Seed: the 36 universe names and the benchmark. No network source; SQ trades as XYZ at Twelve Data and SEC.
INSERT INTO instrument_ids (ticker, instrument_type, vendor_symbols, valid_from)
SELECT i.ticker,
       CASE WHEN i.source = 'benchmark' THEN 'etf' ELSE 'equity' END,
       CASE WHEN i.ticker = 'SQ' THEN '{"twelvedata": "XYZ", "sec": "XYZ"}'::jsonb ELSE '{}'::jsonb END,
       DATE '2026-10-09'
FROM instruments i
WHERE i.source IN ('guide', 'sample extension', 'benchmark')
ON CONFLICT (ticker) WHERE valid_to IS NULL DO NOTHING;
