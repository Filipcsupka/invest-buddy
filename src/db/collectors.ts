import type pg from "pg";
import type { CollectedDocument } from "../collectors/types";
import type { Form4Transaction, FilingFile } from "../collectors/edgar";
import { archiveFiling } from "../data/filing-archive";
import type { EpsHistoryBatch, HolderEvent } from "../collectors/sources/common";
import type { MacroObservation } from "../collectors/macro-observations";
import { insertEpsHistory, insertMemoryEpsHistory, latestEpsObserved, latestMemoryEpsObserved, type EpsHistoryRow } from "./eps-history";
import { insertMacroObservations, insertMemoryMacroObservations } from "./macro-observations";
import { freshnessDays } from "../data/evidence";
import { insiderFromFact, netBuyFromTransactions, INSIDER_WINDOW_DAYS, type InsiderNetBuy, type InsiderTxRow, DEFAULT_INSIDER_MIN_NET_BUY_USD, INSIDER_FACT_DAYS, INSIDER_FACT_LEAD_DAYS, type InsiderDocument, type InsiderResult } from "../data/insider";
import { FACT_SOURCE_IDS, licenceClassFor, sourceIdFor } from "../data/sources-registry";
import { DEFAULT_EPS_BEAT_MIN_SURPRISE_PCT, EPS_FACT_KEY, epsFromFact, type EpsResult } from "../data/eps";

export interface StoredDocument extends CollectedDocument { id: number }
/** `expiresAt` (ISO date or timestamp) replaces the default 30-day fact expiry. */
export interface Fact { symbol: string; key: string; asOf: string; value: unknown; documentIds: number[]; expiresAt?: string; /** Registry id. Defaults to the key's single writer, else the first linked document's source. */ sourceId?: string }
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
  /** Newest eps_history observed_at per symbol (ISO UTC). Symbols without a row are absent. */
  latestEpsObserved(): Promise<Map<string, string>>;
  /** Metered requests recorded for a source in runs started at or after `since` (ISO timestamp). */
  apiRequestsSince(source: string, since: string): Promise<number>;
}
export interface CollectorRepository extends SourceState {
  upsertDocument(doc: CollectedDocument): Promise<{ id: number; written: boolean }>;
  upsertInsiderTransactions?(accession: string, ticker: string, filedAt: string, rows: Form4Transaction[]): Promise<void>;
  markSecInsiderChecked?(ticker: string, checkedAt: string): Promise<void>;
  /** Archives the full filing text (D19). Absent on stores that do not keep it. */
  archiveFiling?(file: FilingFile): Promise<unknown>;
  upsertHolderEvent?(event: HolderEvent): Promise<boolean>;
  /** Stores macro observations (D24). Returns the rows written; an unchanged value is not written again. */
  upsertMacroObservations?(rows: MacroObservation[]): Promise<number>;
  /** Stores the raw EARNINGS answer and every quarter that is new or changed (D28). Returns the rows written. */
  upsertEpsHistory?(batch: EpsHistoryBatch): Promise<number>;
  /** 90-day net open-market buying from stored Form 4 lines, with the ids of the stored Form 4 filings behind it. null when the ticker has no line in the window. */
  insiderNetBuy?(symbol: string, asOf: string): Promise<(InsiderNetBuy & { documentIds: number[]; sourceId?: string }) | null>;
  upsertFact(fact: Fact): Promise<boolean>;
  bars(symbol: string, limit: number): Promise<{ date: string; close: number; volume: number }[]>;
  recordRun(run: CollectorRun): Promise<void>;
}
export class MemoryCollectorRepository implements CollectorRepository {
  readonly documents = new Map<string, StoredDocument>();
  readonly facts = new Map<string, Fact>();
  readonly runs: CollectorRun[] = [];
  readonly insiderTransactions = new Map<string, Form4Transaction>();
  readonly holderEvents = new Map<string, HolderEvent>();
  readonly macroObservations: MacroObservation[] = [];
  readonly epsHistory: EpsHistoryRow[] = [];
  async upsertEpsHistory(batch: EpsHistoryBatch) { return insertMemoryEpsHistory(this.epsHistory, batch); }
  async upsertMacroObservations(rows: MacroObservation[]) { return insertMemoryMacroObservations(this.macroObservations, rows); }
  async upsertHolderEvent(event: HolderEvent) {
    if (this.holderEvents.has(event.accession)) return false;
    this.holderEvents.set(event.accession, structuredClone(event));
    return true;
  }
  private readonly insiderOrigin = new Map<string, { accession: string; ticker: string; filedAt: string }>();
  async upsertInsiderTransactions(accession: string, ticker: string, filedAt: string, rows: Form4Transaction[]) {
    for (const row of rows) { this.insiderTransactions.set(`${accession}:${row.lineNo}`, structuredClone(row)); this.insiderOrigin.set(`${accession}:${row.lineNo}`, { accession, ticker, filedAt }); }
  }
  async insiderNetBuy(symbol: string, asOf: string) {
    const lines: InsiderTxRow[] = [...this.insiderTransactions].flatMap(([key, row]) => {
      const origin = this.insiderOrigin.get(key);
      return origin && origin.ticker === symbol ? [{ accession: origin.accession, ticker: symbol, transactionDate: row.transactionDate, filedAt: origin.filedAt, code: row.code, shares: row.shares, price: row.price, derivative: row.derivative }] : [];
    });
    const net = netBuyFromTransactions(lines, asOf);
    if (!net) return null;
    const accessions = new Set(net.accessions);
    return { ...net, documentIds: [...this.documents.values()].filter((doc) => doc.docType === "4" && doc.symbol === symbol && accessions.has(String(doc.meta.accession))).map((doc) => doc.id) };
  }
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
  async latestEpsObserved() { return latestMemoryEpsObserved(this.epsHistory); }
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
    FROM collected_facts f WHERE f.symbol=$1 AND f.fact_key=$2 AND f.as_of <= $3::date AND (f.source_id <> 'eodhd' OR f.computed_at::date <= $3::date) ORDER BY f.as_of DESC LIMIT 1`, [symbol, EPS_FACT_KEY, asOf]);
  const row = fact.rows[0];
  return row ? epsFromFact({ asOf: row.as_of, value: row.value }, row.url, asOf, minSurprisePct) : null;
}
/** Reads the newest fresh insider_net_buy_90d fact and the display-allowed Form 4 documents behind it. null when there is no usable fact. */
export async function loadInsider(pool: pg.Pool, symbol: string, asOf: string, minNetBuy = DEFAULT_INSIDER_MIN_NET_BUY_USD): Promise<InsiderResult | null> {
  const fact = await pool.query<{ as_of: string; value: unknown; document_ids: string[] }>(`SELECT as_of::text,value,document_ids FROM collected_facts
    WHERE symbol=$1 AND fact_key='insider_net_buy_90d' AND source_id <> 'eodhd'
      AND as_of <= $2::date + $4::int AND as_of > $2::date - $3::int ORDER BY as_of DESC LIMIT 1`, [symbol, asOf, INSIDER_FACT_DAYS, INSIDER_FACT_LEAD_DAYS]);
  const row = fact.rows[0];
  if (!row) return null;
  const docs = await pool.query<{ url: string; published: string; meta: { trades?: InsiderDocument["trades"] } }>(`SELECT url,to_char(published_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS published,meta FROM source_documents
    WHERE id = ANY($1::bigint[]) AND symbol=$2 AND doc_type='4' AND meta->>'display_allowed'='true' ORDER BY published_at DESC`, [row.document_ids, symbol]);
  return insiderFromFact({ asOf: row.as_of, value: row.value }, docs.rows.map((doc) => ({ url: doc.url, publishedAt: doc.published, trades: Array.isArray(doc.meta.trades) ? doc.meta.trades : [] })), asOf, minNetBuy);
}
export class PostgresCollectorRepository implements CollectorRepository {
  constructor(private readonly pool: pg.Pool) {}
  async markSecInsiderChecked(ticker: string, checkedAt: string) {
    await this.pool.query(`INSERT INTO sec_insider_refresh (ticker,checked_at) VALUES ($1,$2)
      ON CONFLICT (ticker) DO UPDATE SET checked_at=GREATEST(sec_insider_refresh.checked_at,EXCLUDED.checked_at)`, [ticker, checkedAt]);
  }
  async upsertMacroObservations(rows: MacroObservation[]) { return insertMacroObservations(this.pool, rows); }
  async upsertEpsHistory(batch: EpsHistoryBatch) { return insertEpsHistory(this.pool, batch); }
  async upsertHolderEvent(event: HolderEvent) {
    const result = await this.pool.query(`INSERT INTO holder_events (accession,ticker,filer_name,filer_cik,form,filed_at,percent,shares)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (accession) DO NOTHING`,
      [event.accession,event.ticker,event.filerName,event.filerCik,event.form,event.filedAt,event.percent,event.shares]);
    return (result.rowCount ?? 0) > 0;
  }
  async upsertInsiderTransactions(accession: string, ticker: string, filedAt: string, rows: Form4Transaction[]) {
    await this.pool.query("DELETE FROM insider_transactions WHERE accession=$1 AND source_id='eodhd'", [accession]);
    for (const row of rows) await this.pool.query(`INSERT INTO insider_transactions
      (accession,line_no,ticker,owner_cik,owner_name,reporting_owners,is_director,is_officer,is_ten_percent_owner,is_other,
       transaction_date,code,shares,price,acquired_disposed,derivative,shares_after,filed_at,plan_10b5_1)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (accession,line_no) DO NOTHING`,
      [accession,row.lineNo,ticker,row.ownerCik,row.ownerName,JSON.stringify(row.reportingOwners),row.isDirector,row.isOfficer,row.isTenPercentOwner,row.isOther,
        row.transactionDate,row.code,row.shares,row.price,row.acquiredDisposed,row.derivative,row.sharesAfter,filedAt,row.plan10b5]);
  }
  async insiderNetBuy(symbol: string, asOf: string) {
    const from = new Date(Date.parse(`${asOf}T00:00:00Z`) - INSIDER_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const result = await this.pool.query<{ accession: string; transaction_date: string; filed_at: string; code: string; shares: string; price: string | null; derivative: boolean; source_id: string }>(
      `SELECT accession,transaction_date::text,filed_at::text,code,shares::text,price::text,derivative,source_id FROM insider_transactions
       WHERE ticker=$1 AND transaction_date BETWEEN $2::date AND $3::date AND filed_at BETWEEN $2::date AND $3::date
         AND (first_observed_at IS NULL OR (first_observed_at AT TIME ZONE 'UTC')::date <= $3::date)`, [symbol, from, asOf]);
    const net = netBuyFromTransactions(result.rows.map((row) => ({ accession: row.accession, ticker: symbol, transactionDate: row.transaction_date, filedAt: row.filed_at, code: row.code,
      shares: Number(row.shares), price: row.price === null ? null : Number(row.price), derivative: row.derivative })), asOf);
    if (!net) return null;
    const docs = net.accessions.length ? await this.pool.query<{ id: string }>("SELECT id FROM source_documents WHERE symbol=$1 AND doc_type='4' AND meta->>'accession' = ANY($2::text[]) ORDER BY id", [symbol, net.accessions]) : { rows: [] };
    return { ...net, documentIds: docs.rows.map((row) => Number(row.id)), sourceId: result.rows.some((row) => row.source_id === "eodhd") ? "eodhd" : "sec" };
  }
  archiveFiling(file: FilingFile) { return archiveFiling(this.pool, file); }
  async upsertDocument(doc: CollectedDocument) {
    const sourceId = doc.sourceId ?? sourceIdFor(doc.source);
    const prior = await this.pool.query<{ content_hash: string }>("SELECT content_hash FROM source_documents WHERE url=$1", [doc.url]);
    const result = await this.pool.query<{ id: string }>(`INSERT INTO source_documents (source,symbol,doc_type,url,published_at,content_hash,body,meta,expires_at,source_id,licence_class,display_allowed)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now()+make_interval(days => $12::int),$9,$10,$11)
      ON CONFLICT (url) DO UPDATE SET source=EXCLUDED.source,symbol=EXCLUDED.symbol,doc_type=EXCLUDED.doc_type,
        published_at=EXCLUDED.published_at,content_hash=EXCLUDED.content_hash,body=EXCLUDED.body,meta=EXCLUDED.meta,
        fetched_at=now(),expires_at=EXCLUDED.expires_at,source_id=EXCLUDED.source_id,licence_class=EXCLUDED.licence_class,display_allowed=EXCLUDED.display_allowed
      RETURNING id`, [doc.source, doc.symbol, doc.docType, doc.url, doc.publishedAt, doc.contentHash, doc.body, JSON.stringify(doc.meta),
        sourceId, licenceClassFor(sourceId), doc.meta.display_allowed === true, documentRetentionDays(doc.docType)]);
    return { id: Number(result.rows[0].id), written: prior.rows[0]?.content_hash !== doc.contentHash };
  }
  async upsertFact(fact: Fact) {
    const result = await this.pool.query(`WITH src AS (SELECT COALESCE($7::text, (SELECT d.source_id FROM source_documents d WHERE d.id = ANY($5::bigint[]) ORDER BY d.id LIMIT 1), 'unknown') AS id)
      INSERT INTO collected_facts (symbol,fact_key,as_of,value,document_ids,expires_at,source_id,licence_class)
      SELECT $1,$2,$3,$4::jsonb,$5::bigint[],COALESCE($6::timestamptz,now()+interval '30 days'),src.id,
        COALESCE((SELECT s.licence_class FROM data_sources s WHERE s.id = src.id),'unknown') FROM src
      ON CONFLICT (symbol,fact_key,as_of) DO UPDATE SET value=EXCLUDED.value,document_ids=EXCLUDED.document_ids,
        computed_at=now(),expires_at=EXCLUDED.expires_at,source_id=EXCLUDED.source_id,licence_class=EXCLUDED.licence_class
      WHERE (collected_facts.value,collected_facts.document_ids,collected_facts.source_id) IS DISTINCT FROM (EXCLUDED.value,EXCLUDED.document_ids,EXCLUDED.source_id)
        AND NOT (collected_facts.fact_key='eps_surprise_latest' AND collected_facts.source_id='eodhd' AND EXCLUDED.source_id <> 'eodhd')
        AND NOT (collected_facts.fact_key='insider_net_buy_90d' AND collected_facts.source_id='sec' AND EXCLUDED.source_id='eodhd')`,
      [fact.symbol, fact.key, fact.asOf, JSON.stringify(fact.value), fact.documentIds, fact.expiresAt ?? null, fact.sourceId ?? FACT_SOURCE_IDS[fact.key] ?? null]);
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
  async latestEpsObserved() { return latestEpsObserved(this.pool); }
  async latestFactDates(key: string) {
    const result = await this.pool.query<{ symbol: string; as_of: string }>("SELECT symbol,max(as_of)::text AS as_of FROM collected_facts WHERE fact_key=$1 GROUP BY symbol", [key]);
    return new Map(result.rows.map((row) => [row.symbol, row.as_of]));
  }
  async apiRequestsSince(source: string, since: string) {
    const result = await this.pool.query<{ n: string }>("SELECT COALESCE(sum((api_requests->>$1)::int),0)::text AS n FROM collector_runs WHERE started_at >= $2::timestamptz", [source, since]);
    return Number(result.rows[0]?.n ?? 0);
  }
}
