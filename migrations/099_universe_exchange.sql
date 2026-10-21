-- Existing memberships predate the exchange-aware symbol master and are US listings.
ALTER TABLE universe_membership ADD COLUMN exchange text NOT NULL DEFAULT 'US';
ALTER TABLE universe_membership ADD CONSTRAINT universe_membership_exchange_check CHECK
  (exchange IN ('US','XETRA','LSE','PA','AS','SW','PR','WAR','MI','MC','ST','OL','CO','HE','VI','BR','LS'));
CREATE INDEX IF NOT EXISTS universe_membership_exchange_current_idx ON universe_membership(exchange,ticker) WHERE valid_to IS NULL;
