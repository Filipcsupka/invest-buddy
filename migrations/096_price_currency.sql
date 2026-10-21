-- Retain the quote currency with EODHD bars and their immutable revisions.
ALTER TABLE daily_bars ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE daily_bar_revisions ADD COLUMN IF NOT EXISTS currency text;
