import type pg from "pg";
import type { CollectedDocument } from "../collectors/types";

export interface StoredDocument extends CollectedDocument { id: number }
export interface Fact { symbol: string; key: string; asOf: string; value: unknown; documentIds: number[] }
/** Keep filings through the longest evidence window they can support. */
export const documentRetentionDays = (docType: string) => /^(8-K|10-Q|10-K|20-F|6-K)(?:\b|\s)|EX-99\.1|XBRL revenue/i.test(docType) ? 100 : /^(4|13F)\b|insider/i.test(docType) ? 60 : 30;
export interface CollectorRun { startedAt: string; sources: string[]; requested: number; succeeded: number; failures: { ticker: string; reason: string }[]; documentsWritten: number; factsWritten: number; stoppedReason: string | null }
export interface CollectorRepository {
  upsertDocument(doc: CollectedDocument): Promise<{ id: number; written: boolean }>;
  upsertFact(fact: Fact): Promise<boolean>;
  bars(symbol: string, limit: number): Promise<{ date: string; close: number; volume: number }[]>;
  recordRun(run: CollectorRun): Promise<void>;
}
export class MemoryCollectorRepository implements CollectorRepository {
  readonly documents = new Map<string, StoredDocument>();
  readonly facts = new Map<string, Fact>();
  readonly runs: CollectorRun[] = [];
  async upsertDocument(doc: CollectedDocument) {
    const old = this.documents.get(doc.url);
    if (old?.contentHash === doc.contentHash) return { id: old.id, written: false };
    const id = old?.id ?? this.documents.size + 1;
    this.documents.set(doc.url, { ...doc, id });
    return { id, written: true };
  }
  async upsertFact(fact: Fact) {
    const key = `${fact.symbol}:${fact.key}:${fact.asOf}`;
    if (JSON.stringify(this.facts.get(key)) === JSON.stringify(fact)) return false;
    this.facts.set(key, structuredClone(fact));
    return true;
  }
  async bars(): Promise<{ date: string; close: number; volume: number }[]> { return []; }
  async recordRun(run: CollectorRun) { this.runs.push(structuredClone(run)); }
}
export class PostgresCollectorRepository implements CollectorRepository {
  constructor(private readonly pool: pg.Pool) {}
  async upsertDocument(doc: CollectedDocument) {
    const prior = await this.pool.query<{ content_hash: string }>("SELECT content_hash FROM source_documents WHERE url=$1", [doc.url]);
    const result = await this.pool.query<{ id: string }>(`INSERT INTO source_documents (source,symbol,doc_type,url,published_at,content_hash,body,meta,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now()+make_interval(days => $9::int))
      ON CONFLICT (url) DO UPDATE SET source=EXCLUDED.source,symbol=EXCLUDED.symbol,doc_type=EXCLUDED.doc_type,
        published_at=EXCLUDED.published_at,content_hash=EXCLUDED.content_hash,body=EXCLUDED.body,meta=EXCLUDED.meta,
        fetched_at=now(),expires_at=EXCLUDED.expires_at
      RETURNING id`, [doc.source, doc.symbol, doc.docType, doc.url, doc.publishedAt, doc.contentHash, doc.body, JSON.stringify(doc.meta), documentRetentionDays(doc.docType)]);
    return { id: Number(result.rows[0].id), written: prior.rows[0]?.content_hash !== doc.contentHash };
  }
  async upsertFact(fact: Fact) {
    const result = await this.pool.query(`INSERT INTO collected_facts (symbol,fact_key,as_of,value,document_ids)
      VALUES ($1,$2,$3,$4::jsonb,$5::bigint[])
      ON CONFLICT (symbol,fact_key,as_of) DO UPDATE SET value=EXCLUDED.value,document_ids=EXCLUDED.document_ids,
        computed_at=now(),expires_at=now()+interval '30 days'
      WHERE (collected_facts.value,collected_facts.document_ids) IS DISTINCT FROM (EXCLUDED.value,EXCLUDED.document_ids)`,
      [fact.symbol, fact.key, fact.asOf, JSON.stringify(fact.value), fact.documentIds]);
    return (result.rowCount ?? 0) > 0;
  }
  async bars(symbol: string, limit: number) {
    const result = await this.pool.query<{ date: string; close: string; volume: string }>(`SELECT to_char(bar_date,'YYYY-MM-DD') AS date,close::text,volume::text
      FROM daily_bars WHERE ticker=$1 ORDER BY bar_date DESC LIMIT $2`, [symbol, limit]);
    return result.rows.map((row) => ({ date: row.date, close: Number(row.close), volume: Number(row.volume) }));
  }
  async recordRun(run: CollectorRun) {
    await this.pool.query(`INSERT INTO collector_runs (started_at,sources,requested_count,succeeded_count,failed_count,documents_written,facts_written,failures,stopped_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [run.startedAt, run.sources, run.requested, run.succeeded, run.failures.length, run.documentsWritten, run.factsWritten, JSON.stringify(run.failures), run.stoppedReason]);
  }
}
