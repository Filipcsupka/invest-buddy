ALTER TABLE etf_catalog ADD COLUMN IF NOT EXISTS enrichment_source text;
ALTER TABLE etf_catalog ADD COLUMN IF NOT EXISTS holdings_count integer;
ALTER TABLE etf_catalog DROP CONSTRAINT IF EXISTS etf_catalog_enrichment_status_check;
ALTER TABLE etf_catalog ADD CONSTRAINT etf_catalog_enrichment_status_check
  CHECK (enrichment_status IN ('pending', 'ok', 'failed', 'eodhd_unmapped', 'eodhd_incomplete'));
