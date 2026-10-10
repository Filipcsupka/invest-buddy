-- D20: retain structured Form 4 transactions without an expiry.
CREATE TABLE insider_transactions (
  accession text NOT NULL,
  line_no integer NOT NULL,
  ticker text NOT NULL REFERENCES instruments(ticker),
  owner_cik text,
  owner_name text,
  reporting_owners jsonb NOT NULL,
  is_director boolean,
  is_officer boolean,
  is_ten_percent_owner boolean,
  is_other boolean,
  transaction_date date NOT NULL,
  code text NOT NULL,
  shares numeric NOT NULL,
  price numeric,
  acquired_disposed text,
  derivative boolean NOT NULL,
  shares_after numeric,
  filed_at date NOT NULL,
  plan_10b5_1 text NOT NULL CHECK (plan_10b5_1 IN ('yes','no','unknown')),
  PRIMARY KEY (accession,line_no)
);
CREATE INDEX insider_transactions_window_idx ON insider_transactions(ticker,transaction_date,filed_at);

-- Include only filed, priced, open-market non-derivative P/S rows, matching the existing fact.
CREATE FUNCTION insider_net_buy(p_ticker text, p_as_of date, p_window integer)
RETURNS TABLE(net_shares numeric, net_dollars numeric, dollars_complete boolean)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(CASE code WHEN 'P' THEN shares ELSE -shares END),0),
         COALESCE(sum(CASE code WHEN 'P' THEN shares * price ELSE -shares * price END),0),
         count(*) FILTER (WHERE price IS NULL) = 0
  FROM insider_transactions
  WHERE ticker=p_ticker AND filed_at<=p_as_of AND filed_at>=p_as_of-p_window
    AND transaction_date<=p_as_of AND transaction_date>=p_as_of-p_window
    AND code IN ('P','S') AND NOT derivative;
$$;
