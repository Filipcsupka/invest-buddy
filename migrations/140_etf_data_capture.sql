-- total_assets_currency stays NULL unless the response names the asset currency
-- or the listing is a USD listing on the US venue (110 contract, no sentinel).
-- ucits_hint carries the Xetra catalog hint and is never confirmation.
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS open_figi text;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS average_mkt_cap_mil numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS annual_holdings_turnover numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS index_name text;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS effective_duration numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS modified_duration numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS yield_to_maturity numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS coupon numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS effective_maturity numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS week_52_high numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS week_52_low numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS beta numeric;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS ter_ambiguous boolean NOT NULL DEFAULT false;
ALTER TABLE etf_fund_stats ADD COLUMN IF NOT EXISTS ucits_hint boolean;
COMMENT ON COLUMN etf_fund_stats.payload IS
  'Rows written before migration 140 hold the bare ETF_Data object without Holdings. Later rows hold the full fundamentals root {General, Technicals?, ETF_Data}. Read ETF fields with COALESCE(payload->''ETF_Data'', payload).';

-- Catalog copy of the Xetra UCITS hint, kept apart from the confirmed ucits
-- column, and the TER unit gap from the EODHD mapper.
ALTER TABLE etf_catalog ADD COLUMN IF NOT EXISTS ucits_hint boolean;
ALTER TABLE etf_catalog ADD COLUMN IF NOT EXISTS ter_gap text;
ALTER TABLE etf_catalog DROP CONSTRAINT IF EXISTS etf_catalog_ter_gap_check;
ALTER TABLE etf_catalog ADD CONSTRAINT etf_catalog_ter_gap_check CHECK (ter_gap IN ('ter_ambiguous'));
-- Only codex enrichment ever wrote ucits; elsewhere it still holds the Xetra
-- hint. The next catalog sync sets ucits_hint on every listing.
UPDATE etf_catalog SET ucits_hint = ucits
  WHERE ucits_hint IS NULL AND ucits IS NOT NULL AND enrichment_source IS DISTINCT FROM 'codex';

-- Preserve the new classification produced from General.Category end to end.
ALTER TABLE etf_catalog DROP CONSTRAINT IF EXISTS etf_catalog_asset_class_check;
ALTER TABLE etf_catalog ADD CONSTRAINT etf_catalog_asset_class_check
  CHECK (asset_class IN ('equity','bond','commodity','multi_asset','money_market','other'));
ALTER TABLE etf_picks DROP CONSTRAINT IF EXISTS etf_picks_asset_class_check;
ALTER TABLE etf_picks ADD CONSTRAINT etf_picks_asset_class_check
  CHECK (asset_class IN ('equity','bond','commodity','multi_asset','money_market','other'));
