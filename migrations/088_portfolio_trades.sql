-- Private executed trades from the owner's Flex statement. Kept with each dated baseline.
ALTER TABLE portfolio_baseline ADD COLUMN trades jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE portfolio_baseline ADD COLUMN trade_from_date date;
ALTER TABLE portfolio_baseline ADD CONSTRAINT portfolio_baseline_trades_array CHECK (jsonb_typeof(trades) = 'array');
