import type pg from "pg";
import type { FilingFile } from "../collectors/edgar";
import { putSnapshot } from "./raw-store";
import { licenceClassFor } from "./sources-registry";

/**
 * Filing text archive (roadmap D19, migration 051). The full body goes to the raw store (D17, gzip, no expiry) and `filings`
 * records what it is: accession, file, form, items, filing date, URL, size, hash, snapshot and licence (D3 provenance).
 * Writing the same file again changes nothing; a different body for the same file replaces the pointer and keeps the old snapshot.
 */
export async function archiveFiling(db: Pick<pg.Pool, "query">, file: FilingFile): Promise<{ stored: boolean }> {
  const snapshot = await putSnapshot(db, { sourceId: "sec", key: `filing:${file.accession}:${file.name}`, body: file.body,
    contentType: /\.xml$/i.test(file.name) ? "application/xml" : "text/html", meta: { ticker: file.ticker, cik: file.cik, form: file.form, docType: file.docType } });
  const result = await db.query(`INSERT INTO filings (accession,doc_name,ticker,cik,form,doc_type,items,filed_at,primary_doc_url,size_bytes,content_hash,snapshot_id,source_id,licence_class)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,'sec',$13)
    ON CONFLICT (accession,doc_name) DO UPDATE SET content_hash=EXCLUDED.content_hash,size_bytes=EXCLUDED.size_bytes,snapshot_id=EXCLUDED.snapshot_id,fetched_at=now()
      WHERE filings.content_hash <> EXCLUDED.content_hash`,
    [file.accession, file.name, file.ticker, file.cik, file.form, file.docType, file.items, file.filedAt, file.url, snapshot.sizeBytes, snapshot.contentHash, snapshot.id, licenceClassFor("sec")]);
  return { stored: (result.rowCount ?? 0) > 0 };
}

/** Accessions that already have a primary document archived, so the backfill skips their requests. */
export async function archivedAccessions(db: Pick<pg.Pool, "query">, accessions: string[]): Promise<Set<string>> {
  if (!accessions.length) return new Set();
  const result = await db.query<{ accession: string }>("SELECT DISTINCT accession FROM filings WHERE accession = ANY($1::text[])", [accessions]);
  return new Set(result.rows.map((row) => row.accession));
}
