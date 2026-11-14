-- Adds the Passive investor plan to entitlements.tier. Additive: every existing row stays valid.
-- Rollback: move Passive rows back to free first, then restore the old check:
--   UPDATE entitlements SET tier = 'free' WHERE tier = 'passive';
--   ALTER TABLE entitlements DROP CONSTRAINT entitlements_tier_check;
--   ALTER TABLE entitlements ADD CONSTRAINT entitlements_tier_check CHECK (tier IN ('free', 'plus'));
ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_tier_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_tier_check CHECK (tier IN ('free', 'passive', 'plus'));
