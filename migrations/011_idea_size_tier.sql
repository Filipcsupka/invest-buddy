-- G2: the public signal carries a size tier, a share of a full position in the reader's own portfolio, instead of a EUR band.
-- STARTER is about 1/3 of a full position, STANDARD about 2/3, FULL a full one; ADD_THIRD and ADD_HALF add that share of a full position
-- on top of an existing one. NONE means no new money (WATCH, HOLD, REDUCE, THESIS_BROKEN). Nullable: ideas stored before this migration have no tier.
ALTER TABLE trade_ideas ADD COLUMN size_tier text
  CHECK (size_tier IN ('NONE','STARTER','STANDARD','FULL','ADD_THIRD','ADD_HALF'));

-- The EUR band stays for the owner's private view only. It is filled when a portfolio baseline exists and is 0 otherwise.
ALTER TABLE trade_ideas ALTER COLUMN amount_min_eur SET DEFAULT 0;
ALTER TABLE trade_ideas ALTER COLUMN amount_max_eur SET DEFAULT 0;

COMMENT ON COLUMN trade_ideas.size_tier IS 'Size tier from src/engine/signals.ts; public. NULL for ideas stored before migration 011.';
COMMENT ON COLUMN trade_ideas.amount_min_eur IS 'Owner view only: EUR band from the private baseline, 0 without one.';
COMMENT ON COLUMN trade_ideas.signature IS 'action|company|entry|catalyst|size_tier since migration 011 (before: action|company|entry|catalyst|min-max).';
