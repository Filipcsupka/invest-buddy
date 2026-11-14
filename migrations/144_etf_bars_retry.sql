-- A history backfill that returns no bars or fails waits until this time before the symbol is requested again.
ALTER TABLE etf_tracked ADD COLUMN IF NOT EXISTS bars_retry_after timestamptz;
