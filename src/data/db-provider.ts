import type pg from "pg";
import type { Fundamentals, Macro, OHLCV } from "../engine";
import type { UniverseProvider, Instrument } from "./providers";

const allowed = (value: boolean | null, claim: string, evidence: { flags?: Record<string, boolean> }, low = false): boolean | null => low || (value === true && !evidence.flags?.[claim]) ? null : value;
export class DatabaseUniverseProvider implements UniverseProvider {
  readonly provenance = new Map<string, { runId: string; evidenceUrls: string[] }>();
  constructor(private readonly pool: pg.Pool, private readonly asOf?: string) {}
  async instruments(): Promise<Instrument[]> {
    const rows = await this.pool.query<Instrument & { ticker: string }>(`SELECT i.ticker,i.name,i.sector,i.tier,i.source FROM instruments i
      JOIN scan_findings f ON f.symbol=i.ticker AND f.superseded_by IS NULL
      WHERE ($1::date IS NULL OR f.as_of <= $1) AND f.id=(SELECT f2.id FROM scan_findings f2 WHERE f2.symbol=i.ticker AND f2.superseded_by IS NULL AND ($1::date IS NULL OR f2.as_of <= $1) ORDER BY f2.as_of DESC,f2.received_at DESC LIMIT 1)
      ORDER BY i.ticker`, [this.asOf ?? null]);
    return rows.rows.map((row) => ({ ...row }));
  }
  async bars(ticker: string): Promise<OHLCV[]> {
    const rows = await this.pool.query<{ bar_date: string; open: string; high: string; low: string; close: string; volume: string }>("SELECT bar_date::text,open,high,low,close,volume FROM daily_bars WHERE ticker=$1 AND ($2::date IS NULL OR bar_date <= $2) ORDER BY bar_date", [ticker, this.asOf ?? null]);
    return rows.rows.map((row) => ({ date: row.bar_date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }));
  }
  async fundamentals(ticker: string): Promise<Fundamentals> {
    const rows = await this.pool.query<{ run_id: string; fundamentals: Record<string, unknown>; evidence: { items: { url: string }[]; flags: Record<string, boolean> }; confidence: string }>("SELECT run_id,fundamentals,evidence,confidence FROM scan_findings WHERE symbol=$1 AND superseded_by IS NULL AND ($2::date IS NULL OR as_of <= $2) ORDER BY as_of DESC,received_at DESC LIMIT 1", [ticker, this.asOf ?? null]);
    const row = rows.rows[0]; if (!row) throw new Error(`No scan for ${ticker}`);
    this.provenance.set(ticker, { runId: row.run_id, evidenceUrls: row.evidence.items.map((item) => item.url) });
    const f = row.fundamentals as { revenueAccelerating: boolean | null; revenueDeclining: boolean | null; epsBeat: boolean | null; guidanceRaised: boolean | null; guidanceCut: boolean | null; productCatalyst: { present: boolean } | null; insiderOrInstitutionalBuying: boolean | null };
    const a = (value: boolean | null, field: string) => allowed(value, `fundamentals.${field}`, row.evidence, row.confidence === "low");
    return { revenueGrowthCurrent: null, revenueGrowthPrior: null, revenueAccelerating: a(f.revenueAccelerating, "revenueAccelerating"), revenueDeclining: a(f.revenueDeclining, "revenueDeclining"), epsBeat: a(f.epsBeat, "epsBeat"), guidanceRaised: a(f.guidanceRaised, "guidanceRaised"), earningsMissAndGuidanceCut: f.epsBeat === false && a(f.guidanceCut, "guidanceCut") === true ? true : f.epsBeat === null || f.guidanceCut === null ? null : false, productCatalyst: a(f.productCatalyst?.present ?? null, "productCatalyst"), insiderOrInstitutionalAccumulation: a(f.insiderOrInstitutionalBuying, "insiderOrInstitutionalBuying"), noRevenue: null, memePump: null };
  }
  async macro(): Promise<Macro> {
    const rows = await this.pool.query<{ data: { sectorRotationIntoGrowth: boolean | null; dataTailwind: boolean | null }; evidence: { flags: Record<string, boolean> } }>("SELECT data,evidence FROM macro_findings WHERE superseded_by IS NULL AND ($1::date IS NULL OR as_of <= $1) ORDER BY as_of DESC,received_at DESC LIMIT 1", [this.asOf ?? null]);
    const row = rows.rows[0]; if (!row) return { growthSectorRotation: null, dataTailwind: null };
    return { growthSectorRotation: allowed(row.data.sectorRotationIntoGrowth, "macro.sectorRotationIntoGrowth", row.evidence), dataTailwind: allowed(row.data.dataTailwind, "macro.dataTailwind", row.evidence) };
  }
  async latestScanDate() { const result = await this.pool.query<{ as_of: string }>("SELECT max(as_of)::text as_of FROM scan_runs"); return result.rows[0]?.as_of ?? null; }
}
