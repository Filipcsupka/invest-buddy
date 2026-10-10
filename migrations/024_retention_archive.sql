-- D5: archive tables for rows the retention job used to delete. Public SEC rows are moved here instead of deleted.
-- New tables only: no lock on the live tables, no dropped columns. Ids are the original ids, so they stay unique.
CREATE TABLE IF NOT EXISTS source_documents_archive (LIKE source_documents INCLUDING DEFAULTS);
ALTER TABLE source_documents_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS collected_facts_archive (LIKE collected_facts INCLUDING DEFAULTS);
ALTER TABLE collected_facts_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_documents_archive_pkey') THEN
    ALTER TABLE source_documents_archive ADD CONSTRAINT source_documents_archive_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'collected_facts_archive_pkey') THEN
    ALTER TABLE collected_facts_archive ADD CONSTRAINT collected_facts_archive_pkey PRIMARY KEY (id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS source_documents_archive_url ON source_documents_archive (url);
CREATE INDEX IF NOT EXISTS source_documents_archive_symbol ON source_documents_archive (symbol, published_at DESC);
CREATE INDEX IF NOT EXISTS collected_facts_archive_symbol ON collected_facts_archive (symbol, fact_key, as_of DESC);
