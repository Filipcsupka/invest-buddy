-- EN11: combined RULESET_VERSION (src/config/rules.ts) stored next to each new record snapshot and trade idea.
-- Additive and nullable; rows written before this migration stay NULL (no backfill). record_snapshots.rules_version keeps the score version.
-- Not read by any public page and not part of the daily fingerprint or the idea signature.
ALTER TABLE record_snapshots ADD COLUMN IF NOT EXISTS ruleset_version text;
ALTER TABLE trade_ideas ADD COLUMN IF NOT EXISTS ruleset_version text;
