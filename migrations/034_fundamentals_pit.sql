-- SEC companyfacts, including revisions from later filings.
CREATE TABLE fundamentals_pit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticker text NOT NULL REFERENCES instruments(ticker),
  concept text NOT NULL,
  taxonomy text NOT NULL,
  unit text NOT NULL,
  period_start date,
  period_end date NOT NULL,
  fy integer,
  fp text,
  form text NOT NULL,
  filed date NOT NULL,
  accession text NOT NULL,
  value numeric NOT NULL,
  frame text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (ticker, taxonomy, concept, unit, period_start, period_end, accession)
);

CREATE INDEX fundamentals_pit_as_of_idx ON fundamentals_pit (ticker, concept, filed, period_end);

-- Watch marks an accession only after its companyfacts refresh succeeds.
CREATE TABLE fundamentals_refresh (
  ticker text NOT NULL REFERENCES instruments(ticker),
  accession text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, accession)
);

-- A replay sees filings available on its date, including the earlier version of a restated fact.
CREATE FUNCTION fundamentals_as_of(known_on date)
RETURNS SETOF fundamentals_pit
LANGUAGE sql STABLE AS $$
  SELECT * FROM fundamentals_pit WHERE filed <= known_on;
$$;
