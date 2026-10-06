import type pg from "pg";
import type { CollectedDocument } from "../collectors/types";
import { freshnessDays } from "../data/evidence";
import { insiderFromFact, DEFAULT_INSIDER_MIN_NET_BUY_USD, INSIDER_FACT_DAYS, INSIDER_FACT_LEAD_DAYS, type InsiderDocument, type InsiderResult } from "../data/insider";
import { DEFAULT_EPS_BEAT_MIN_SURPRISE_PCT, EPS_FACT_KEY, epsFromFact, type EpsResult } from "../data/eps";

export interface StoredDocument extends CollectedDocument { id: number }
/** `expiresAt` (ISO date or timestamp) replaces the default 30-day fact expiry. */
export interface Fact { symbol: string; key: string; asOf: string; value: unknown; documentIds: number[]; expiresAt?: string }
/** Keep a document through the longest evidence window of any field it can support. The windows are `freshnessDays` in evidence.ts. */
export const documentRetentionDays = (docType: string) => /^(8-K|10-Q|10-K|20-F|6-K)(?:\b|\s)|EX-99\.1|XBRL revenue|EPS surprise/i.test(docType)
  ? Math.max(freshnessDays.revenueAccelerating, freshnessDays.epsBeat, freshnessDays.guidanceRaised)
  : /^4\b/i.test(docType) ? Math.max(400, freshnessDays.insiderOrInstitutionalBuying)
    : /^13F\b|insider/i.test(docType) ? freshnessDays.insiderOrInstitutionalBuying
    : Math.max(freshnessDays.productCatalyst, freshnessDays.narrativeChanged);
/** `apiRequests` counts requests to metered APIs per source (alphavantage), so a daily cap can be checked across runs. */
export interface CollectorRun { startedAt: string; sources: string[]; requested: number; succeeded: number; failures: { ticker: string; reason: string }[]; documentsWritten: number; factsWritten: number; stoppedReason: string | null; apiRequests?: Record<string, number> }
/** Read access a source needs to plan its requests. */
export interface SourceState {
  /** Newest as_of per symbol for one fact key. */
  latestFactDates(key: string): Promise<Map<string, string>>;
  /** Metered requests recorded for a source in runs started at or after `since` (ISO timestamp). */
  apiRequestsSince(source: string, since: string): Promise<number>;
}
export interface CollectorRepository extends SourceState {
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
  async latestFactDates(key: string) {
    const out = new Map<string, string>();
    for (const fact of this.facts.values()) if (fact.key === key && fact.asOf > (out.get(fact.symbol) ?? "")) out.set(fact.symbol, fact.asOf);
    return out;
  }
  async apiRequestsSince(source: string, since: string) {
    return this.runs.filter((run) => run.startedAt >= since).reduce((n, run) => n + (run.apiRequests?.[source] ?? 0), 0);
  }
}
/** Reads the newest eps_surprise_latest fact on or before asOf (also a stale one, so the reason can say so). null when there is none. */
export async function loadEpsSurprise(pool: pg.Pool, symbol: string, asOf: string, minSurprisePct = DEFAULT_EPS_BEAT_MIN_SURPRISE_PCT): Promise<EpsResult | null> {
  const fact = await pool.query<{ as_of: string; value: unknown; url: string | null }>(`SELECT f.as_of::text,f.value,
      (SELECT d.url FROM source_documents d WHERE d.id = ANY(f.document_ids) ORDER BY d.id DESC LIMIT 1) AS url
    FROM collected_facts f WHERE f.symbol=$1 AND f.fact_key=$2 AND f.as_of <= $3::date ORDER BY f.as_of DESC LIMIT 1`, [symbol, EPS_FACT_KEY, asOf]);
  const row = fact.rows[0];
  return row ? epsFromFact({ asOf: row.as_of, value: row.value }, row.url, asOf, minSurprisePct) : null;
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
    const result = await this.pool.query(`INSERT INTO collected_facts (symbol,fact_key,as_of,value,document_ids,expires_at)
      VALUES ($1,$2,$3,$4::jsonb,$5::bigint[],COALESCE($6::timestamptz,now()+interval '30 days'))
      ON CONFLICT (symbol,fact_key,as_of) DO UPDATE SET value=EXCLUDED.value,document_ids=EXCLUDED.document_ids,
        computed_at=now(),expires_at=EXCLUDED.expires_at
      WHERE (collected_facts.value,collected_facts.document_ids) IS DISTINCT FROM (EXCLUDED.value,EXCLUDED.document_ids)`,
      [fact.symbol, fact.key, fact.asOf, JSON.stringify(fact.value), fact.documentIds, fact.expiresAt ?? null]);
    return (result.rowCount ?? 0) > 0;
  }
  async bars(symbol: string, limit: number) {
    const result = await this.pool.query<{ date: string; close: string; volume: string }>(`SELECT to_char(bar_date,'YYYY-MM-DD') AS date,close::text,volume::text
      FROM daily_bars WHERE ticker=$1 ORDER BY bar_date DESC LIMIT $2`, [symbol, limit]);
    return result.rows.map((row) => ({ date: row.date, close: Number(row.close), volume: Number(row.volume) }));
  }
  async recordRun(run: CollectorRun) {
    await this.pool.query(`INSERT INTO collector_runs (started_at,sources,requested_count,succeeded_count,failed_count,documents_written,facts_written,failures,stopped_reason,api_requests)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)`, [run.startedAt, run.sources, run.requested, run.succeeded, run.failures.length, run.documentsWritten, run.factsWritten, JSON.stringify(run.failures), run.stoppedReason, JSON.stringify(run.apiRequests ?? {})]);
  }
  async latestFactDates(key: string) {
    const result = await this.pool.query<{ symbol: string; as_of: string }>("SELECT symbol,max(as_of)::text AS as_of FROM collected_facts WHERE fact_key=$1 GROUP BY symbol", [key]);
    return new Map(result.rows.map((row) => [row.symbol, row.as_of]));
  }
  async apiRequestsSince(source: string, since: string) {
    const result = await this.pool.query<{ n: string }>("SELECT COALESCE(sum((api_requests->>$1)::int),0)::text AS n FROM collector_runs WHERE started_at >= $2::timestamptz", [source, since]);
    return Number(result.rows[0]?.n ?? 0);
  }
}
