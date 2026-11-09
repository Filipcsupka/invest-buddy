-- Better Auth 1.7.18 stores bigint ids as strings in its API; Postgres assigns them.
-- Rollback, after stopping customer auth: drop auth_rate_limits, auth_verifications,
-- auth_accounts, auth_sessions, user_consents, their indexes, then the new users
-- columns and auth_rw role. Only do this after exporting or discarding account data.
ALTER TABLE users
  ADD COLUMN name text NOT NULL DEFAULT '',
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN image text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_login_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN terms_accepted_at timestamptz,
  ADD COLUMN terms_version text,
  ADD COLUMN marketing_consent_at timestamptz,
  ADD COLUMN marketing_consent_version text;

-- Existing case-variant emails must be resolved before applying this migration.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE auth_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires_at);

CREATE TABLE auth_accounts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
CREATE INDEX IF NOT EXISTS auth_accounts_user_idx ON auth_accounts (user_id);

CREATE TABLE auth_verifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_verifications_identifier_idx ON auth_verifications (identifier);
CREATE INDEX IF NOT EXISTS auth_verifications_expires_idx ON auth_verifications (expires_at);

CREATE TABLE auth_rate_limits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  last_request bigint NOT NULL
);

CREATE TABLE user_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('terms', 'marketing')),
  version text NOT NULL,
  granted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_consents_user_idx ON user_consents (user_id, recorded_at DESC);

-- The web account code can inherit this NOLOGIN role when PL19 creates login roles.
-- web_ro receives no access to account data.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_rw') THEN
    CREATE ROLE auth_rw NOLOGIN;
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, auth_sessions, auth_accounts,
  auth_verifications, auth_rate_limits TO auth_rw;
GRANT DELETE ON subscriptions TO auth_rw;
GRANT SELECT, INSERT ON user_consents TO auth_rw;
GRANT USAGE ON SEQUENCE users_id_seq, auth_sessions_id_seq, auth_accounts_id_seq,
  auth_verifications_id_seq, auth_rate_limits_id_seq, user_consents_id_seq TO auth_rw;
