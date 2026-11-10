-- One row per normalised email that has received a Plus trial. Holds a keyed HMAC, never the address.
-- No foreign key to users on purpose: the row outlives account deletion, so delete and re-register gives no second trial.
-- The key derives from AUTH_SECRET; rotating AUTH_SECRET makes old claims unmatchable.
-- Apply before turning TRIAL on. Rollback, after turning TRIAL off: DROP TABLE trial_claims;
CREATE TABLE trial_claims (
  email_hmac text PRIMARY KEY,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON trial_claims TO auth_rw;
