-- Rule streaks read only rule id and state from each score snapshot.
-- The generated column keeps the small projection beside the row; the migration 137 partial indexes already cover the reads.
-- Adding the stored column rewrites score_results once (6,923 rows, 126 MB on 2026-11-24).
-- Rollback: drop the column, then score_streak_hits(jsonb).
CREATE OR REPLACE FUNCTION score_streak_hits(audit jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'matched', h.matched, 'unknown', coalesce(h.unknown, false))), '[]'::jsonb)
  FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(audit->'ruleHits') = 'array' THEN audit->'ruleHits' ELSE '[]'::jsonb END)
    AS h(id text, matched boolean, unknown boolean)
$$;

ALTER TABLE score_results
  ADD COLUMN IF NOT EXISTS streak_hits jsonb GENERATED ALWAYS AS (score_streak_hits(audit)) STORED;
