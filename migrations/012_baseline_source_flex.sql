-- The portfolio job writes the baseline from the Flex report, so 'flex' joins the allowed sources.
ALTER TABLE portfolio_baseline DROP CONSTRAINT IF EXISTS portfolio_baseline_source_check;
ALTER TABLE portfolio_baseline ADD CONSTRAINT portfolio_baseline_source_check CHECK (source IN ('manual','ibkr-mcp','flex'));
