-- EODHD General.Sector and General.Industry per listing, with the day they were first stored, so a replay reads only known values.
ALTER TABLE symbols
  ADD COLUMN sector text,
  ADD COLUMN industry text,
  ADD COLUMN sector_observed_on date;

-- Regional benchmark for European listings: iShares STOXX Europe 600 UCITS ETF (DE) on XETRA. It is priced like SPY and never scored.
INSERT INTO instruments (ticker,name,sector,tier,source)
VALUES ('EXSA.XETRA','iShares STOXX Europe 600 UCITS ETF (DE)','Benchmark',NULL,'benchmark')
ON CONFLICT (ticker) DO NOTHING;
INSERT INTO instrument_ids (ticker,instrument_type,exchange,currency,vendor_symbols,valid_from)
VALUES ('EXSA.XETRA','etf','XETRA','EUR','{"eodhd": "EXSA.XETRA"}'::jsonb,DATE '2026-10-21')
ON CONFLICT (ticker) WHERE valid_to IS NULL DO NOTHING;
INSERT INTO universe_membership (ticker,list,tier,valid_from,reason,criteria_version,added_by,exchange)
SELECT 'EXSA.XETRA','benchmark',NULL,DATE '2026-10-21','Regional benchmark for European listings','2026-10-21','seed','XETRA'
WHERE NOT EXISTS (SELECT 1 FROM universe_membership WHERE ticker='EXSA.XETRA' AND valid_to IS NULL);
