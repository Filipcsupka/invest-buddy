import type pg from "pg";
import type { Fundamentals, Macro, OHLCV } from "../engine";
import type { UniverseProvider, Instrument } from "./providers";

export class DatabaseUniverseProvider implements UniverseProvider {
  readonly provenance = new Map<string, { runIds: Record<string, string>; evidenceUrls: string[]; agreement: Record<string, string>; consensusValues: Record<string, boolean | null> }>();
  constructor(private readonly pool: pg.Pool, private readonly asOf?: string) {}
  async instruments(): Promise<Instrument[]> {
    const rows = await this.pool.query<Instrument & { ticker: string }>(`SELECT DISTINCT i.ticker,i.name,i.sector,i.tier,i.source FROM instruments i
      JOIN consensus_findings c ON c.symbol=i.ticker WHERE ($1::date IS NULL OR c.as_of <= $1) ORDER BY i.ticker`, [this.asOf ?? null]);
    return rows.rows.map((row) => ({ ...row }));
  }
  async bars(ticker: string): Promise<OHLCV[]> {
    const rows = await this.pool.query<{ bar_date: string; open: string; high: string; low: string; close: string; volume: string }>("SELECT bar_date::text,open,high,low,close,volume FROM daily_bars WHERE ticker=$1 AND ($2::date IS NULL OR bar_date <= $2) ORDER BY bar_date", [ticker, this.asOf ?? null]);
    return rows.rows.map((row) => ({ date: row.bar_date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }));
  }
  async fundamentals(ticker: string): Promise<Fundamentals> {
    const rows = await this.pool.query<{ field: string; value: boolean | null; agreement: string; agent_values: Record<string, { runId: string }>; evidence_refs: { url: string }[]; verified: boolean }>(`SELECT DISTINCT ON (field) field,value,agreement,agent_values,evidence_refs,verified
      FROM consensus_findings WHERE symbol=$1 AND ($2::date IS NULL OR as_of <= $2) ORDER BY field,as_of DESC`, [ticker, this.asOf ?? null]);
    const by = new Map(rows.rows.map((row) => [row.field,row]));
    const runIds: Record<string,string> = {};
    const agreement: Record<string,string> = {};
    const consensusValues: Record<string,boolean | null> = {};
    const evidenceUrls = new Set<string>();
    for (const row of rows.rows) {
      agreement[row.field] = row.agreement;
      consensusValues[row.field] = row.verified && (row.agreement === "agree" || row.agreement === "xbrl_override") ? row.value : null;
      for (const [agent, item] of Object.entries(row.agent_values)) runIds[agent] = item.runId;
      for (const item of row.evidence_refs) evidenceUrls.add(item.url);
    }
    this.provenance.set(ticker, { runIds, evidenceUrls: [...evidenceUrls], agreement, consensusValues });
    const get = (field: string) => { const row = by.get(field); return row?.verified && (row.agreement === "agree" || row.agreement === "xbrl_override") ? row.value : null; };
    const epsBeat = get("epsBeat"), guidanceCut = get("guidanceCut");
    return { revenueGrowthCurrent: null, revenueGrowthPrior: null, revenueAccelerating: get("revenueAccelerating"), revenueDeclining: get("revenueDeclining"), epsBeat, guidanceRaised: get("guidanceRaised"), earningsMissAndGuidanceCut: epsBeat === false && guidanceCut === true ? true : epsBeat === null || guidanceCut === null ? null : false, productCatalyst: get("productCatalyst"), insiderOrInstitutionalAccumulation: get("insiderOrInstitutionalBuying"), noRevenue: null, memePump: null };
  }
  async macro(ticker: string): Promise<Macro> {
    const rows = await this.pool.query<{ field: string; value: boolean | null; agreement: string; verified: boolean }>(`SELECT DISTINCT ON (field) field,value,agreement,verified FROM consensus_findings
      WHERE symbol=$1 AND field IN ('sectorRotationIntoGrowth','dataTailwind') AND ($2::date IS NULL OR as_of <= $2)
      ORDER BY field,as_of DESC`, [ticker, this.asOf ?? null]);
    const by = new Map(rows.rows.map((row) => [row.field,row]));
    const get = (field: string) => { const row = by.get(field); return row?.verified && row.agreement === "agree" ? row.value : null; };
    return { growthSectorRotation: get("sectorRotationIntoGrowth"), dataTailwind: get("dataTailwind") };
  }
  async latestScanDate() { const result = await this.pool.query<{ as_of: string }>("SELECT max(as_of)::text as_of FROM reconcile_runs"); return result.rows[0]?.as_of ?? null; }
}
