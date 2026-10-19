-- Calendar observations can include pool and research symbols not present in instruments.
-- Keep the existing append-only table and its readers; only relax the ticker reference.
ALTER TABLE earnings_calendar_snapshots DROP CONSTRAINT earnings_calendar_snapshots_ticker_fkey;
