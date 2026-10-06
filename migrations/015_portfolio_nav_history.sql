-- Private NAV history, one row per statement date. Read server-side only to compute indexed series; never exposed raw.
CREATE TABLE IF NOT EXISTS portfolio_nav_history (
  date date PRIMARY KEY,
  nav_eur numeric NOT NULL CHECK (nav_eur > 0),
  deposits_eur numeric NOT NULL DEFAULT 0,
  source text NOT NULL CHECK (source IN ('flex-daily', 'flex-summary')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
