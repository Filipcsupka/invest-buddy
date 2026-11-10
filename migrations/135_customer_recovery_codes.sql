-- Recovery codes for customer accounts. Owner approval required before any database gets this.
-- The running app must keep the same AUTH_SECRET to reveal codes that were never shown.
-- Rollback, after stopping customer auth: DROP TABLE user_recovery_codes;
CREATE TABLE user_recovery_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  reveal_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_recovery_codes_user_unused_idx ON user_recovery_codes (user_id) WHERE used_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_recovery_codes TO auth_rw;
GRANT USAGE ON SEQUENCE user_recovery_codes_id_seq TO auth_rw;
