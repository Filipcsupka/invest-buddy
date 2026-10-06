import type pg from "pg";
import type { CollectedDocument } from "../collectors/types";
import { freshnessDays } from "../data/evidence";
import { insiderFromFact, DEFAULT_INSIDER_MIN_NET_BUY_USD, INSIDER_FACT_DAYS, INSIDER_FACT_LEAD_DAYS, type InsiderDocument, type InsiderResult } from "../data/insider";

export interface StoredDocument extends CollectedDocument { id: number }
export interface Fact { symbol: string; key: string; asOf: string; value: unknown; documentIds: number[] }
/** Keep a document through the longest evidence window of any field it can support. The windows are `freshnessDays` in evidence.ts. */
export const documentRetentionDays = (docType: string) => /^(8-K|10-Q|10-K|20-F|6-K)(?:\b|\s)|EX-99\.1|XBRL revenue/i.test(docType)
  ? Math.max(freshnessDays.revenueAccelerating, freshnessDays.epsBeat, freshnessDays.guidanceRaised)
  : /^(4|13F)\b|insider/i.test(docType) ? freshnessDays.insiderOrInstitutionalBuying
    : Math.max(freshnessDays.productCatalyst, freshnessDays.narrativeChanged);
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
/** Reads the newest fresh insider_net_buy_90d fact and the display-allowed Form 4 documents behind it. null when there is no usable fact. */
export async function loadInsider(pool: pg.Pool, symbol: string, asOf: string, minNetBuy = DEFAULT_INSIDER_MIN_NET_BUY_USD): Promise<InsiderResult | null> {
  const fact = await pool.query<{ as_of: string; value: unknown; document_ids: string[] }>(`SELECT as_of::text,value,document_ids FROM collected_facts
    WHERE symbol=$1 AND fact_key='insider_net_buy_90d' AND as_of <= $2::date + $4::int AND as_of > $2::date - $3::int ORDER BY as_of DESC LIMIT 1`, [symbol, asOf, INSIDER_FACT_DAYS, INSIDER_FACT_LEAD_DAYS]);
  const row = fact.rows[0];
  if (!row) return null;
  const docs = await pool.query<{ url: string; published: string; meta: { trades?: InsiderDocument["trades"] } }>(`SELECT url,to_char(published_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS published,meta FROM source_documents
    WHERE id = ANY($1::bigint[]) AND symbol=$2 AND doc_type='4' AND meta->>'display_allowed'='true' ORDER BY published_at DESC`, [row.document_ids, symbol]);
  return insiderFromFact({ asOf: row.as_of, value: row.value }, docs.rows.map((doc) => ({ url: doc.url, publishedAt: doc.published, trades: Array.isArray(doc.meta.trades) ? doc.meta.trades : [] })), asOf, minNetBuy);
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
