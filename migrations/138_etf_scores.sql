-- Point-in-time ETF screening results. Historical versions remain available after rule changes.
CREATE TABLE IF NOT EXISTS etf_scores (
  listing_key text NOT NULL REFERENCES etf_catalog(listing_key),
  as_of date NOT NULL,
  rules_version text NOT NULL,
  rule_hits jsonb NOT NULL,
  rejections jsonb NOT NULL DEFAULT '[]'::jsonb,
  concentration jsonb NOT NULL DEFAULT '{}'::jsonb,
  earned smallint NOT NULL CHECK (earned BETWEEN 0 AND 35),
  evidenced_max smallint NOT NULL CHECK (evidenced_max BETWEEN 0 AND 35),
  state text NOT NULL CHECK (state IN ('rated','not_rated')),
  PRIMARY KEY (listing_key, as_of, rules_version)
);
CREATE INDEX IF NOT EXISTS etf_scores_latest_idx ON etf_scores(listing_key, as_of DESC);
