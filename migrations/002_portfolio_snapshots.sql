CREATE TABLE portfolio_snapshots (
  as_of date PRIMARY KEY,
  publish_on date NOT NULL CHECK (publish_on > as_of),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_snapshots_publication ON portfolio_snapshots (publish_on DESC, as_of DESC);
