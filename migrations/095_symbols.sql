-- EODHD symbol master. Vendor symbols include the exchange suffix (for example BMW.XETRA).
CREATE TABLE IF NOT EXISTS symbols (
  vendor_symbol text PRIMARY KEY,
  code text NOT NULL,
  exchange text NOT NULL,
  name text NOT NULL,
  isin text,
  currency text,
  type text,
  country text,
  first_seen date NOT NULL,
  last_seen date NOT NULL,
  delisted boolean NOT NULL DEFAULT false,
  CHECK (vendor_symbol = code || '.' || exchange)
);
CREATE INDEX IF NOT EXISTS symbols_exchange_delisted_idx ON symbols (exchange, delisted);
CREATE INDEX IF NOT EXISTS symbols_isin_idx ON symbols (isin);
