-- ETF catalog (owner decision 2026-10-21): every ETF tradable on Xetra (official free list, UCITS funds carry a KID so EEA retail clients such as IBKR customers can buy them),
-- enriched once by a cheap model, refreshed weekly for new listings. A weekly smarter run evaluates a shortlist of this catalog and writes etf_picks.
-- Additive: new table only.
CREATE TABLE IF NOT EXISTS etf_catalog (
  isin text PRIMARY KEY CHECK (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  wkn text,
  mnemonic text,
  name text NOT NULL,
  instrument_type text NOT NULL CHECK (instrument_type IN ('ETF', 'ACTIVE_ETF', 'ETC', 'ETN')),
  exchange text NOT NULL DEFAULT 'XETR',
  trading_currency text,
  ucits boolean,
  issuer text,
  asset_class text CHECK (asset_class IN ('equity', 'bond', 'commodity', 'multi_asset', 'other')),
  region text,
  theme text,
  tracked_index text,
  ter_pct numeric(6,3),
  aum_usd_m numeric(14,1),
  domicile text,
  replication text,
  distribution text CHECK (distribution IN ('acc', 'dist')),
  source_url text,
  enrichment_status text NOT NULL DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'ok', 'failed')),
  enrich_attempts smallint NOT NULL DEFAULT 0,
  enriched_at timestamptz,
  first_seen date NOT NULL,
  last_seen date NOT NULL,
  shortlist boolean NOT NULL DEFAULT false,
  shortlist_rank integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS etf_catalog_class_idx ON etf_catalog (asset_class, region);
CREATE INDEX IF NOT EXISTS etf_catalog_status_idx ON etf_catalog (enrichment_status, enrich_attempts);
CREATE INDEX IF NOT EXISTS etf_catalog_shortlist_idx ON etf_catalog (shortlist, shortlist_rank);
CREATE INDEX IF NOT EXISTS etf_catalog_name_idx ON etf_catalog (lower(name));
