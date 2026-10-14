-- Watchdog duplicate suppression: one row per alert key, holding when it was last sent. The watchdog skips a key for 24 hours after a send.
-- Additive: one new table. Grants follow the role split (PL19, PL20) once those roles exist; none are set here.
CREATE TABLE IF NOT EXISTS alert_state (
  alert_key text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL,
  last_subject text NOT NULL
);
