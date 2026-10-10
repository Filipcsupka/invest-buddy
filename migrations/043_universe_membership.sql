-- Membership dates are half-open: valid_from <= day < valid_to.
CREATE TABLE universe_membership (
  id bigserial PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  list text NOT NULL CHECK (list IN ('core', 'extended', 'discovery', 'benchmark')),
  tier smallint CHECK (tier BETWEEN 1 AND 3),
  valid_from date NOT NULL,
  valid_to date,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  criteria_version text NOT NULL CHECK (length(trim(criteria_version)) > 0),
  added_by text NOT NULL CHECK (length(trim(added_by)) > 0),
  removed_reason text,
  removed_by text,
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE UNIQUE INDEX universe_membership_current_idx ON universe_membership(ticker) WHERE valid_to IS NULL;
CREATE INDEX universe_membership_as_of_idx ON universe_membership(ticker,valid_from,valid_to);

-- Seed only the original 36 names and SPY. Later approvals need their own dated row.
INSERT INTO universe_membership (ticker,list,tier,valid_from,reason,criteria_version,added_by)
SELECT ticker,
  CASE WHEN source='benchmark' THEN 'benchmark' WHEN source='discovery' THEN 'discovery'
       WHEN source='sample extension' THEN 'extended' ELSE 'core' END,
  tier, DATE '2026-10-09', 'Initial tracked universe', '2026-10-09', 'seed'
FROM instruments
WHERE ticker IN (
  'NVDA','AMD','AVGO','SMCI','PLTR','GOOGL','AMZN','MSFT','SNOW','NET','DDOG','CRM',
  'CRWD','PANW','ZS','OKTA','SQ','AFRM','PYPL','VRTX','CRSP','REGN','PCVX','TSLA',
  'ENPH','ROKU','SHOP','SE','MELI','META','AAPL','UBER','ASML','ORCL','NOW','MDB','SPY'
);
