-- Fund detail peer reads start from matching stats or catalog index candidates.
CREATE INDEX IF NOT EXISTS etf_fund_stats_category_view_idx ON etf_fund_stats (lower(category), listing_key, as_of DESC);
CREATE INDEX IF NOT EXISTS etf_fund_stats_index_view_idx ON etf_fund_stats (lower(index_name), listing_key, as_of DESC);
CREATE INDEX IF NOT EXISTS etf_catalog_tracked_index_view_idx ON etf_catalog (lower(tracked_index), listing_key) WHERE instrument_type='ETF';
