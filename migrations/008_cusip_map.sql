-- CUSIP to ticker cache for the 13F source. symbol is NULL for a CUSIP that was looked up and is not a universe name.
CREATE TABLE cusip_map (
  cusip text PRIMARY KEY CHECK (cusip ~ '^[0-9A-Z]{9}$'),
  symbol text REFERENCES instruments(ticker),
  figi text,
  name text,
  resolved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cusip_map_symbol ON cusip_map (symbol) WHERE symbol IS NOT NULL;
