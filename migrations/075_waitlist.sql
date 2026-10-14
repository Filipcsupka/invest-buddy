-- Waitlist sign-ups (W11). Kept apart from accounts: consent differs and unconfirmed rows are purged after 14 days.
-- Email is stored lower-cased and trimmed, one row per address.
-- Grants: the web writes this table (insert, update by token or id); the report script and the retention job read and delete.
-- A read-only web role (PL19) must not be granted SELECT on it, because it holds email addresses.
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  locale text NOT NULL CHECK (locale IN ('en', 'sk')),
  source text,
  price_variant text,
  consent_launch boolean NOT NULL,
  consent_weekly boolean NOT NULL DEFAULT false,
  consent_text_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  token_hash text,
  token_expires_at timestamptz,
  confirmation_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  UNIQUE (email)
);
CREATE INDEX IF NOT EXISTS waitlist_signups_token_hash_idx ON waitlist_signups (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS waitlist_signups_pending_idx ON waitlist_signups (created_at) WHERE status = 'pending';
