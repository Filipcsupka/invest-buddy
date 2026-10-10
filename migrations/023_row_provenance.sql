-- D3: row-level provenance on daily_bars, collected_facts and source_documents.
-- Additive only. Columns are added nullable (no table rewrite), backfilled, then guarded by a CHECK that is
-- added NOT VALID and validated (validation takes a lock that does not block reads or writes).
-- meta.display_allowed stays readable; source_documents.display_allowed is kept equal to it by a trigger until consumers move.

CREATE OR REPLACE FUNCTION source_id_for(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE name
    WHEN 'edgar' THEN 'sec' WHEN 'frames' THEN 'sec' WHEN 'getcurrent' THEN 'sec' WHEN '13f' THEN 'sec'
    WHEN 'sec-frames' THEN 'sec' WHEN 'sec-getcurrent' THEN 'sec' WHEN 'sec-13f' THEN 'sec'
    WHEN 'vix' THEN 'cboe'
    ELSE name
  END
$$;

-- daily_bars: every stored bar so far comes from Twelve Data (internal only).
ALTER TABLE daily_bars ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE daily_bars ADD COLUMN IF NOT EXISTS fetched_at timestamptz;
ALTER TABLE daily_bars ADD COLUMN IF NOT EXISTS vendor_symbol text;
ALTER TABLE daily_bars ALTER COLUMN source_id SET DEFAULT 'twelvedata';
ALTER TABLE daily_bars ALTER COLUMN fetched_at SET DEFAULT now();
UPDATE daily_bars SET source_id = 'twelvedata', vendor_symbol = CASE ticker WHEN 'SQ' THEN 'XYZ' ELSE ticker END
  WHERE source_id IS NULL;

-- source_documents
ALTER TABLE source_documents ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE source_documents ADD COLUMN IF NOT EXISTS licence_class text;
ALTER TABLE source_documents ADD COLUMN IF NOT EXISTS display_allowed boolean;
UPDATE source_documents d SET
    source_id = source_id_for(d.source),
    licence_class = COALESCE((SELECT s.licence_class FROM data_sources s WHERE s.id = source_id_for(d.source)), 'unknown'),
    display_allowed = COALESCE(d.meta->>'display_allowed', 'false') = 'true'
  WHERE d.source_id IS NULL OR d.licence_class IS NULL OR d.display_allowed IS NULL;

-- Rows written by code that predates this migration (jobs running during the rollout) get the same values.
CREATE OR REPLACE FUNCTION source_documents_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_id IS NULL THEN NEW.source_id := source_id_for(NEW.source); END IF;
  IF NEW.licence_class IS NULL THEN
    NEW.licence_class := COALESCE((SELECT s.licence_class FROM data_sources s WHERE s.id = NEW.source_id), 'unknown');
  END IF;
  NEW.display_allowed := COALESCE(NEW.meta->>'display_allowed', 'false') = 'true';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS source_documents_provenance ON source_documents;
CREATE TRIGGER source_documents_provenance BEFORE INSERT OR UPDATE ON source_documents
  FOR EACH ROW EXECUTE FUNCTION source_documents_provenance();

-- collected_facts: source from the key where the key has one writer, else from the first linked document, else unknown.
ALTER TABLE collected_facts ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE collected_facts ADD COLUMN IF NOT EXISTS licence_class text;
ALTER TABLE collected_facts ALTER COLUMN source_id SET DEFAULT 'unknown';
ALTER TABLE collected_facts ALTER COLUMN licence_class SET DEFAULT 'unknown';
UPDATE collected_facts f SET source_id = COALESCE(
    CASE f.fact_key
      WHEN 'eps_surprise_latest' THEN 'alphavantage'
      WHEN 'insider_net_buy_90d' THEN 'sec' WHEN 'sec_filer_status' THEN 'sec' WHEN 'holder_5pct_events' THEN 'sec'
      WHEN 'institutional_13f' THEN 'sec' WHEN 'revenue_growth_quarterly' THEN 'sec'
      WHEN 'gov_contract_awards_window' THEN 'usaspending'
      WHEN 'price_move_5d' THEN 'twelvedata'
    END,
    (SELECT d.source_id FROM source_documents d WHERE d.id = ANY(f.document_ids) ORDER BY d.id LIMIT 1),
    'unknown')
  WHERE f.source_id IS NULL;
UPDATE collected_facts f SET licence_class = COALESCE((SELECT s.licence_class FROM data_sources s WHERE s.id = f.source_id), 'unknown')
  WHERE f.licence_class IS NULL;

ALTER TABLE daily_bars ADD CONSTRAINT daily_bars_source_id_set CHECK (source_id IS NOT NULL) NOT VALID;
ALTER TABLE source_documents ADD CONSTRAINT source_documents_provenance_set CHECK (source_id IS NOT NULL AND licence_class IS NOT NULL AND display_allowed IS NOT NULL) NOT VALID;
ALTER TABLE collected_facts ADD CONSTRAINT collected_facts_provenance_set CHECK (source_id IS NOT NULL AND licence_class IS NOT NULL) NOT VALID;
ALTER TABLE source_documents ADD CONSTRAINT source_documents_licence_class_known CHECK (licence_class IN ('public_gov', 'public_attrib', 'internal_only', 'licensed', 'unknown')) NOT VALID;
ALTER TABLE collected_facts ADD CONSTRAINT collected_facts_licence_class_known CHECK (licence_class IN ('public_gov', 'public_attrib', 'internal_only', 'licensed', 'unknown')) NOT VALID;
ALTER TABLE daily_bars VALIDATE CONSTRAINT daily_bars_source_id_set;
ALTER TABLE source_documents VALIDATE CONSTRAINT source_documents_provenance_set;
ALTER TABLE collected_facts VALIDATE CONSTRAINT collected_facts_provenance_set;
ALTER TABLE source_documents VALIDATE CONSTRAINT source_documents_licence_class_known;
ALTER TABLE collected_facts VALIDATE CONSTRAINT collected_facts_licence_class_known;
