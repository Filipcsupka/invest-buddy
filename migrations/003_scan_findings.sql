CREATE TABLE scan_runs (
  run_id uuid PRIMARY KEY,
  as_of date NOT NULL,
  generated_at timestamptz NOT NULL,
  runner jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE scan_findings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES scan_runs(run_id),
  as_of date NOT NULL,
  symbol text NOT NULL REFERENCES instruments(ticker),
  fundamentals jsonb NOT NULL,
  evidence jsonb NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('high','medium','low')),
  runner jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES scan_runs(run_id),
  UNIQUE (run_id, symbol)
);
CREATE INDEX scan_findings_current ON scan_findings (symbol, as_of DESC, received_at DESC) WHERE superseded_by IS NULL;
CREATE TABLE macro_findings (
  run_id uuid PRIMARY KEY REFERENCES scan_runs(run_id),
  as_of date NOT NULL,
  data jsonb NOT NULL,
  evidence jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  superseded_by uuid REFERENCES scan_runs(run_id)
);
CREATE INDEX macro_findings_current ON macro_findings (as_of DESC, received_at DESC) WHERE superseded_by IS NULL;
INSERT INTO instruments (ticker,name,sector,tier,source) VALUES
('NVDA','NVIDIA','AI & semiconductors',1,'guide'),
('AMD','AMD','AI & semiconductors',NULL,'guide'),
('AVGO','Broadcom','AI & semiconductors',1,'guide'),
('SMCI','Super Micro Computer','AI & semiconductors',2,'guide'),
('PLTR','Palantir','AI & semiconductors',2,'guide'),
('GOOGL','Alphabet','AI & semiconductors',NULL,'guide'),
('AMZN','Amazon','Cloud & SaaS',1,'guide'),
('MSFT','Microsoft','Cloud & SaaS',1,'guide'),
('SNOW','Snowflake','Cloud & SaaS',2,'guide'),
('NET','Cloudflare','Cloud & SaaS',2,'guide'),
('DDOG','Datadog','Cloud & SaaS',1,'guide'),
('CRM','Salesforce','Cloud & SaaS',NULL,'guide'),
('CRWD','CrowdStrike','Cybersecurity',1,'guide'),
('PANW','Palo Alto Networks','Cybersecurity',NULL,'guide'),
('ZS','Zscaler','Cybersecurity',NULL,'guide'),
('OKTA','Okta','Cybersecurity',NULL,'guide'),
('SQ','Block','Fintech',NULL,'guide'),
('AFRM','Affirm','Fintech',3,'guide'),
('PYPL','PayPal','Fintech',NULL,'guide'),
('VRTX','Vertex Pharmaceuticals','Biotech',NULL,'guide'),
('CRSP','CRISPR Therapeutics','Biotech',NULL,'guide'),
('REGN','Regeneron','Biotech',NULL,'guide'),
('TSLA','Tesla','Energy & EV',2,'guide'),
('ENPH','Enphase Energy','Energy & EV',3,'guide'),
('ROKU','Roku','Additional growth',3,'guide'),
('SHOP','Shopify','Additional growth',3,'guide'),
('SE','Sea','Additional growth',3,'guide'),
('MELI','MercadoLibre','Additional growth',NULL,'guide'),
('META','Meta Platforms','Sample extension',NULL,'sample extension'),
('AAPL','Apple','Sample extension',NULL,'sample extension'),
('UBER','Uber','Sample extension',NULL,'sample extension'),
('ASML','ASML','Sample extension',NULL,'sample extension'),
('ORCL','Oracle','Sample extension',NULL,'sample extension'),
('NOW','ServiceNow','Sample extension',NULL,'sample extension'),
('MDB','MongoDB','Sample extension',NULL,'sample extension')
ON CONFLICT (ticker) DO NOTHING;
