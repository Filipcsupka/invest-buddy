-- D12: append-only log of every distinct daily bar value we have seen.
-- Additive only: one new table and one column with a constant default (no table rewrite, no long lock).
-- kind 'first'      = the bar as first seen (written when a new bar is inserted).
-- kind 'superseded' = the stored values that an incoming bar replaced; observed_at is when those values were fetched.
CREATE TABLE daily_bar_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  bar_date date NOT NULL,
  observed_at timestamptz NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric NOT NULL,
  source_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('first', 'superseded'))
);
CREATE INDEX daily_bar_revisions_bar ON daily_bar_revisions (ticker, bar_date, observed_at);

CREATE FUNCTION reject_daily_bar_revision_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Daily bar revisions are immutable';
END;
$$;
CREATE TRIGGER daily_bar_revisions_immutable BEFORE UPDATE OR DELETE ON daily_bar_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_daily_bar_revision_change();

ALTER TABLE price_ingest_runs ADD COLUMN IF NOT EXISTS bars_revised integer NOT NULL DEFAULT 0 CHECK (bars_revised >= 0);
