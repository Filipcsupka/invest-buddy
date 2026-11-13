-- TotalAssets currency: USD for a USD listing on the US venue; otherwise
-- unknown unless ETF_Data explicitly states the fund asset currency.
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

-- Preserve the new classification produced from General.Category.
ALTER TABLE etf_catalog DROP CONSTRAINT IF EXISTS etf_catalog_asset_class_check;
ALTER TABLE etf_catalog ADD CONSTRAINT etf_catalog_asset_class_check
  CHECK (asset_class IN ('equity','bond','commodity','multi_asset','money_market','other'));
