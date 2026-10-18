import type pg from "pg";
import type { Fundamentals, Macro, OHLCV } from "../engine";
import { CONFIRMED_FUNDAMENTAL_AGREEMENTS } from "../engine/agreements";
import type { UniverseProvider, Instrument } from "./providers";
import { fieldSourcesFor, type SourceItem } from "./sources";
import { scoredMember } from "../db/universe";
import { carryForwardEnabled, carryState, type ConsensusRow } from "./carry-forward";

type CarryRow = ConsensusRow & { field: string };
export { CONFIRMED_FUNDAMENTAL_AGREEMENTS };
const confirmedFundamental = (row: { verified: boolean; agreement: string }) => row.verified && CONFIRMED_FUNDAMENTAL_AGREEMENTS.includes(row.agreement);
const SEC_REVENUE_URL = /^https:\/\/data\.sec\.gov\/api\/xbrl\/companyfacts\/CIK\d{10}\.json$/;
const SEC_GROWTH_QUOTE = /^Revenue growth (-?\d+(?:\.\d+)?)% versus (-?\d+(?:\.\d+)?)%$/;
function revenueGrowth(rows: ({ verified: boolean; agreement: string; evidence_refs: { url: string; quote?: string }[] } | undefined)[]) {
  for (const row of rows) {
    if (!row?.verified || !["xbrl_override", "agree"].includes(row.agreement)) continue;
    for (const ref of row.evidence_refs) {
      if (!SEC_REVENUE_URL.test(ref.url)) continue;
      const values = SEC_GROWTH_QUOTE.exec(ref.quote ?? "");
      if (!values) continue;
      const current = Number(values[1]), prior = Number(values[2]);
      if (Number.isFinite(current) && Number.isFinite(prior)) return { current, prior };
    }
  }
  return { current: null, prior: null };
}

export class DatabaseUniverseProvider implements UniverseProvider {
  readonly provenance = new Map<string, { runIds: Record<string, string>; evidenceUrls: string[]; agreement: Record<string, string>; consensusValues: Record<string, boolean | null>; fingerprintRows: unknown[]; carriedFrom?: Record<string, string>; expiredFields?: string[]; sources: Record<string, SourceItem[]> }>();
  constructor(private readonly pool: pg.Pool, private readonly asOf?: string, private readonly carry: boolean = carryForwardEnabled()) {}
  private get refDate() { return this.asOf ?? new Date().toISOString().slice(0, 10); }
  /** CARRY_FORWARD=on only: tags rows older than the scoring date as carried and turns rows outside their field window into unknown. */
  private evaluate<T extends CarryRow>(rows: T[]) {
    return rows.map((row) => {
      const state = carryState(row, this.refDate);
      const effective = state.state === "expired" ? { ...row, value: null, verified: false, agent_values: {}, evidence_refs: [] } : row;
      return { row: effective, state };
    });
  }
  async instruments(): Promise<Instrument[]> {
    const rows = await this.pool.query<Instrument & { ticker: string }>(`SELECT DISTINCT i.ticker,i.name,i.sector,m.tier,i.source FROM instruments i
      JOIN universe_membership m ON m.ticker=i.ticker
      JOIN consensus_findings c ON c.symbol=i.ticker
      WHERE ${scoredMember()} AND m.valid_from <= COALESCE($1::date,CURRENT_DATE)
        AND (m.valid_to IS NULL OR m.valid_to > COALESCE($1::date,CURRENT_DATE))
        AND ($1::date IS NULL OR c.as_of <= $1) ORDER BY i.ticker`, [this.asOf ?? null]);
    return rows.rows.map((row) => ({ ...row }));
  }
  async bars(ticker: string): Promise<OHLCV[]> {
    const rows = await this.pool.query<{ bar_date: string; open: string; high: string; low: string; close: string; volume: string }>("SELECT bar_date::text,open,high,low,close,volume FROM daily_bars WHERE ticker=$1 AND ($2::date IS NULL OR bar_date <= $2) ORDER BY bar_date", [ticker, this.asOf ?? null]);
    return rows.rows.map((row) => ({ date: row.bar_date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }));
  }
  async fundamentals(ticker: string): Promise<Fundamentals> {
    if (this.carry) return this.fundamentalsWithCarry(ticker);
    const rows = await this.pool.query<{ field: string; value: boolean | null; agreement: string; agent_values: Record<string, { runId: string }>; evidence_refs: { url: string; quote?: string }[]; verified: boolean }>(`SELECT DISTINCT ON (field) field,as_of::text,value,agreement,agent_values,evidence_refs,verified
      FROM consensus_findings WHERE symbol=$1 AND ($2::date IS NULL OR as_of <= $2) ORDER BY field,as_of DESC`, [ticker, this.asOf ?? null]);
    const by = new Map(rows.rows.map((row) => [row.field,row]));
    const runIds: Record<string,string> = {};
    const agreement: Record<string,string> = {};
    const consensusValues: Record<string,boolean | null> = {};
    const evidenceUrls = new Set<string>();
    const fingerprintRows: unknown[] = [];
    for (const row of rows.rows) {
      fingerprintRows.push(row);
      agreement[row.field] = row.agreement;
      consensusValues[row.field] = confirmedFundamental(row) ? row.value : null;
      for (const [agent, item] of Object.entries(row.agent_values)) runIds[agent] = item.runId;
      for (const item of row.evidence_refs) evidenceUrls.add(item.url);
    }
    this.provenance.set(ticker, { runIds, evidenceUrls: [...evidenceUrls], agreement, consensusValues, fingerprintRows, sources: await fieldSourcesFor(this.pool, rows.rows) });
    const get = (field: string) => { const row = by.get(field); return row && confirmedFundamental(row) ? row.value : null; };
    const epsBeat = get("epsBeat"), guidanceCut = get("guidanceCut");
    const growth = revenueGrowth([by.get("revenueAccelerating"), by.get("revenueDeclining")]);
    return { revenueGrowthCurrent: growth.current, revenueGrowthPrior: growth.prior, revenueAccelerating: get("revenueAccelerating"), revenueDeclining: get("revenueDeclining"), epsBeat, guidanceRaised: get("guidanceRaised"), earningsMissAndGuidanceCut: epsBeat === false && guidanceCut === true ? true : epsBeat === null || guidanceCut === null ? null : false, productCatalyst: get("productCatalyst"), insiderOrInstitutionalAccumulation: get("insiderOrInstitutionalBuying"), noRevenue: null, memePump: null };
  }
  async macro(ticker: string): Promise<Macro> {
    if (this.carry) return this.macroWithCarry(ticker);
    const rows = await this.pool.query<{ field: string; value: boolean | null; agreement: string; verified: boolean }>(`SELECT DISTINCT ON (field) field,as_of::text,value,agreement,verified FROM consensus_findings
      WHERE symbol=$1 AND field IN ('sectorRotationIntoGrowth','dataTailwind') AND ($2::date IS NULL OR as_of <= $2)
      ORDER BY field,as_of DESC`, [ticker, this.asOf ?? null]);
    const by = new Map(rows.rows.map((row) => [row.field,row]));
    const origin = this.provenance.get(ticker);
    if (origin) origin.fingerprintRows.push(...rows.rows);
    const get = (field: string) => { const row = by.get(field); return row?.verified && (row.agreement === "agree" || row.agreement === "data_rule") ? row.value : null; };
    return { growthSectorRotation: get("sectorRotationIntoGrowth"), dataTailwind: get("dataTailwind") };
  }
  private async fundamentalsWithCarry(ticker: string): Promise<Fundamentals> {
    const rows = await this.pool.query<CarryRow>(`SELECT DISTINCT ON (field) field,as_of::text AS as_of,carried_from::text AS carried_from,value,agreement,agent_values,evidence_refs,reason,verified
      FROM consensus_findings WHERE symbol=$1 AND ($2::date IS NULL OR as_of <= $2) ORDER BY field,as_of DESC`, [ticker, this.asOf ?? null]);
    const evaluated = this.evaluate(rows.rows);
    const by = new Map(evaluated.map(({ row }) => [row.field, row]));
    const runIds: Record<string, string> = {};
    const agreement: Record<string, string> = {};
    const consensusValues: Record<string, boolean | null> = {};
    const carriedFrom: Record<string, string> = {};
    const expiredFields: string[] = [];
    const evidenceUrls = new Set<string>();
    const fingerprintRows: unknown[] = [];
    for (const { row, state } of evaluated) {
      fingerprintRows.push({ ...row, carry: state });
      if (state.state === "expired") { expiredFields.push(row.field); carriedFrom[row.field] = state.carriedFrom; consensusValues[row.field] = null; continue; }
      if (state.state === "carried") carriedFrom[row.field] = state.carriedFrom;
      agreement[row.field] = row.agreement;
      consensusValues[row.field] = confirmedFundamental(row) ? row.value : null;
      for (const [agent, item] of Object.entries(row.agent_values)) runIds[agent] = item.runId;
      for (const item of row.evidence_refs) evidenceUrls.add(item.url);
    }
    this.provenance.set(ticker, { runIds, evidenceUrls: [...evidenceUrls], agreement, consensusValues, fingerprintRows, carriedFrom, expiredFields: expiredFields.sort(), sources: await fieldSourcesFor(this.pool, evaluated.map(({ row }) => row)) });
    const get = (field: string) => { const row = by.get(field); return row && confirmedFundamental(row) ? row.value : null; };
    const epsBeat = get("epsBeat"), guidanceCut = get("guidanceCut");
    const growth = revenueGrowth([by.get("revenueAccelerating"), by.get("revenueDeclining")]);
    return { revenueGrowthCurrent: growth.current, revenueGrowthPrior: growth.prior, revenueAccelerating: get("revenueAccelerating"), revenueDeclining: get("revenueDeclining"), epsBeat, guidanceRaised: get("guidanceRaised"), earningsMissAndGuidanceCut: epsBeat === false && guidanceCut === true ? true : epsBeat === null || guidanceCut === null ? null : false, productCatalyst: get("productCatalyst"), insiderOrInstitutionalAccumulation: get("insiderOrInstitutionalBuying"), noRevenue: null, memePump: null };
  }
  private async macroWithCarry(ticker: string): Promise<Macro> {
    const rows = await this.pool.query<CarryRow>(`SELECT DISTINCT ON (field) field,as_of::text AS as_of,carried_from::text AS carried_from,value,agreement,evidence_refs,reason,verified FROM consensus_findings
      WHERE symbol=$1 AND field IN ('sectorRotationIntoGrowth','dataTailwind') AND ($2::date IS NULL OR as_of <= $2)
      ORDER BY field,as_of DESC`, [ticker, this.asOf ?? null]);
    const evaluated = this.evaluate(rows.rows.map((row) => ({ ...row, agent_values: {} })));
    const by = new Map(evaluated.map(({ row }) => [row.field, row]));
    const origin = this.provenance.get(ticker);
    for (const { row, state } of evaluated) {
      origin?.fingerprintRows.push({ ...row, carry: state });
      if (state.state !== "fresh" && origin?.carriedFrom) origin.carriedFrom[row.field] = state.carriedFrom;
      if (state.state === "expired" && origin?.expiredFields && !origin.expiredFields.includes(row.field)) origin.expiredFields.push(row.field);
    }
    origin?.expiredFields?.sort();
    const get = (field: string) => { const row = by.get(field); return row?.verified && (row.agreement === "agree" || row.agreement === "data_rule") ? row.value : null; };
    return { growthSectorRotation: get("sectorRotationIntoGrowth"), dataTailwind: get("dataTailwind") };
  }
  async latestScanDate() { const result = await this.pool.query<{ as_of: string }>("SELECT max(as_of)::text as_of FROM reconcile_runs"); return result.rows[0]?.as_of ?? null; }
}
