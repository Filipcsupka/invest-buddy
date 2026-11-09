-- Rollback, after disabling billing: drop billing_events and entitlements.
-- Export event and entitlement history first if it must be retained.
CREATE TABLE entitlements (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'plus')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired')),
  source text NOT NULL CHECK (source IN ('manual', 'stripe')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (source = 'stripe' OR (provider_customer_id IS NULL AND provider_subscription_id IS NULL))
);
CREATE INDEX IF NOT EXISTS entitlements_user_ends_idx ON entitlements (user_id, ends_at);
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_provider_subscription_idx ON entitlements (provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

CREATE TABLE billing_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS billing_events_user_idx ON billing_events (user_id);

GRANT SELECT, INSERT, UPDATE ON entitlements TO auth_rw;
GRANT SELECT, INSERT ON billing_events TO auth_rw;
GRANT USAGE ON billing_events_id_seq TO auth_rw;
