-- Telegram alerts: one row per channel, target, day and message kind, so a rerun of the
-- digest job never posts the same day twice. Additive: one new table, no change to existing tables.
CREATE TABLE IF NOT EXISTS notification_deliveries (
  channel text NOT NULL CHECK (channel IN ('telegram')),
  target text NOT NULL,
  as_of date NOT NULL,
  kind text NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, target, as_of, kind)
);
