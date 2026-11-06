import type pg from "pg";
import { getPool } from "./pool";
import { sampleEtfPicks, sampleEtfRun, sampleEtfHistory, sampleEtfOutcomes } from "@/data/etf-fixtures";

export type EtfCall = "BUY_ZONE" | "WATCH" | "AVOID";
export type EtfAssetClass = "equity" | "bond" | "commodity" | "multi_asset" | "other";
export type VerificationStatus = "verified" | "partial" | "unverified";
export interface EtfEvidence { url: string; quote: string; claim: string; verified: boolean }
export interface EtfPlan { entryZone: string | null; addWhen: string | null; stopAddingWhen: string | null }
export interface EtfPick {
  symbol: string; exchange: string | null; name: string; isin: string | null; assetClass: EtfAssetClass; region: string | null;
  call: EtfCall; conviction: number | null; thesis: string; whatHappened: string[]; whyItMatters: string; plan: EtfPlan; risks: string[];
  terPct: number | null; aumUsdM: number | null; trackedIndex: string | null; domicile: string | null; replication: string | null;
  price: number | null; priceCurrency: string | null; priceAsOf: string | null; evidence: EtfEvidence[];
  verificationStatus: VerificationStatus; firstSeenAt: string; lastSeenAt: string; benchmarkSymbol: string;
}
export interface EtfRun { asOf: string; status: string; picksCount: number; verifiedCount: number }
export interface EtfHistory { asOf: string; call: EtfCall; conviction: number | null; price: number | null; priceCurrency: string | null }
export interface EtfOutcome { symbol: string; horizonDays: 30 | 60 | 90 | 180; entryDate: string; exitDate: string; returnPct: number; benchmarkSymbol: string; benchmarkReturnPct: number | null; excessPct: number | null }
export interface EtfList { picks: EtfPick[]; run: EtfRun | null; sample: boolean }
export interface EtfDetail { pick: EtfPick; history: EtfHistory[]; outcomes: EtfOutcome[]; sample: boolean }

type Query = Pick<pg.Pool, "query">;
type PickRow = Omit<EtfPick, "assetClass" | "whatHappened" | "whyItMatters" | "terPct" | "aumUsdM" | "trackedIndex" | "priceCurrency" | "priceAsOf" | "verificationStatus" | "firstSeenAt" | "lastSeenAt" | "benchmarkSymbol" | "evidence" | "price"> & {
  asset_class: EtfAssetClass; what_happened: string[]; why_it_matters: string; ter_pct: string | null; aum_usd_m: string | null;
  tracked_index: string | null; price_currency: string | null; price_as_of: string | null; verification_status: VerificationStatus;
  first_seen_at: string; last_seen_at: string; benchmark_symbol: string; price: string | null; evidence: unknown;
};
const date = (value: string | Date | null): string | null => value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const number = (value: string | number | null): number | null => value == null ? null : Number(value);
const evidence = (value: unknown): EtfEvidence[] => Array.isArray(value) ? value.map((item: Record<string, unknown>) => ({
  url: typeof item.url === "string" ? item.url : "", quote: typeof item.quote === "string" ? item.quote : "",
  claim: typeof item.claim === "string" ? item.claim : "other", verified: item.verified === true || item.verificationStatus === "verified" || item.verification_status === "verified",
})).filter((item) => item.url.startsWith("https://") && item.quote) : [];
export function mapEtfPick(row: PickRow): EtfPick {
  return {
    symbol: row.symbol, exchange: row.exchange, name: row.name, isin: row.isin, assetClass: row.asset_class, region: row.region,
    call: row.call, conviction: row.conviction, thesis: row.thesis, whatHappened: row.what_happened ?? [], whyItMatters: row.why_it_matters,
    plan: row.plan ?? { entryZone: null, addWhen: null, stopAddingWhen: null }, risks: row.risks ?? [], terPct: number(row.ter_pct),
    aumUsdM: number(row.aum_usd_m), trackedIndex: row.tracked_index, domicile: row.domicile, replication: row.replication,
    price: number(row.price), priceCurrency: row.price_currency, priceAsOf: date(row.price_as_of), evidence: evidence(row.evidence),
    verificationStatus: row.verification_status, firstSeenAt: date(row.first_seen_at) ?? "", lastSeenAt: date(row.last_seen_at) ?? "",
    benchmarkSymbol: row.benchmark_symbol,
  };
}
const PICK_COLUMNS = "symbol,exchange,name,isin,asset_class,region,call,conviction,thesis,what_happened,why_it_matters,plan,risks,ter_pct,aum_usd_m,tracked_index,domicile,replication,price,price_currency,price_as_of, evidence,verification_status,first_seen_at,last_seen_at,benchmark_symbol";
export async function etfList(db: Query | null = getPool()): Promise<EtfList> {
  if (process.env.DATA_MODE === "fixture") return { picks: sampleEtfPicks, run: sampleEtfRun, sample: true };
  if (!db) return { picks: [], run: null, sample: false };
  const [picks, runs] = await Promise.all([
    db.query<PickRow>(`SELECT ${PICK_COLUMNS} FROM etf_picks ORDER BY asset_class, last_seen_at DESC, symbol`),
    db.query<{ as_of: string; status: string; picks_count: number; verified_count: number }>("SELECT as_of::text,status,picks_count,verified_count FROM etf_research_runs ORDER BY as_of DESC, created_at DESC LIMIT 1"),
  ]);
  const run = runs.rows[0];
  return { picks: picks.rows.map(mapEtfPick), run: run ? { asOf: date(run.as_of) ?? "", status: run.status, picksCount: run.picks_count, verifiedCount: run.verified_count } : null, sample: false };
}
export async function etfDetail(symbol: string, db: Query | null = getPool()): Promise<EtfDetail | null> {
  if (process.env.DATA_MODE === "fixture") {
    const pick = sampleEtfPicks.find((item) => item.symbol === symbol);
    return pick ? { pick, history: sampleEtfHistory[symbol] ?? [], outcomes: sampleEtfOutcomes.filter((item) => item.symbol === symbol), sample: true } : null;
  }
  if (!db) return null;
  const [picks, history, outcomes] = await Promise.all([
    db.query<PickRow>(`SELECT ${PICK_COLUMNS} FROM etf_picks WHERE symbol=$1`, [symbol]),
    db.query<{ as_of: string; call: EtfCall; conviction: number | null; price: string | null; price_currency: string | null }>("SELECT as_of::text,call,conviction,price,price_currency FROM etf_pick_history WHERE symbol=$1 ORDER BY as_of DESC,id DESC", [symbol]),
    db.query<{ symbol: string; horizon_days: 30 | 60 | 90 | 180; entry_date: string; exit_date: string; return_pct: string; benchmark_symbol: string; benchmark_return_pct: string | null; excess_pct: string | null }>("SELECT symbol,horizon_days,entry_date::text,exit_date::text,return_pct,benchmark_symbol,benchmark_return_pct,excess_pct FROM etf_outcomes WHERE symbol=$1 ORDER BY horizon_days", [symbol]),
  ]);
  if (!picks.rows[0]) return null;
  return { pick: mapEtfPick(picks.rows[0]), history: history.rows.map((r) => ({ asOf: date(r.as_of) ?? "", call: r.call, conviction: r.conviction, price: number(r.price), priceCurrency: r.price_currency })),
    outcomes: outcomes.rows.map((r) => ({ symbol: r.symbol, horizonDays: r.horizon_days, entryDate: date(r.entry_date) ?? "", exitDate: date(r.exit_date) ?? "", returnPct: Number(r.return_pct), benchmarkSymbol: r.benchmark_symbol, benchmarkReturnPct: number(r.benchmark_return_pct), excessPct: number(r.excess_pct) })), sample: false };
}
export async function etfOutcomes(db: Query | null = getPool()): Promise<{ outcomes: EtfOutcome[]; sample: boolean }> {
  if (process.env.DATA_MODE === "fixture") return { outcomes: sampleEtfOutcomes, sample: true };
  if (!db) return { outcomes: [], sample: false };
  const result = await db.query<{ symbol: string; horizon_days: 30 | 60 | 90 | 180; entry_date: string; exit_date: string; return_pct: string; benchmark_symbol: string; benchmark_return_pct: string | null; excess_pct: string | null }>("SELECT symbol,horizon_days,entry_date::text,exit_date::text,return_pct,benchmark_symbol,benchmark_return_pct,excess_pct FROM etf_outcomes ORDER BY horizon_days,symbol");
  return { outcomes: result.rows.map((r) => ({ symbol: r.symbol, horizonDays: r.horizon_days, entryDate: date(r.entry_date) ?? "", exitDate: date(r.exit_date) ?? "", returnPct: Number(r.return_pct), benchmarkSymbol: r.benchmark_symbol, benchmarkReturnPct: number(r.benchmark_return_pct), excessPct: number(r.excess_pct) })), sample: false };
}
export interface EtfHorizonSummary { horizonDays: 30 | 60 | 90 | 180; count: number; meanExcess: number | null; medianExcess: number | null; hitRate: number | null }
export function summarizeEtfOutcomes(outcomes: EtfOutcome[]): EtfHorizonSummary[] {
  return ([30, 60, 90, 180] as const).map((horizonDays) => {
    const values = outcomes.filter((row) => row.horizonDays === horizonDays && row.excessPct !== null).map((row) => row.excessPct as number).sort((a, b) => a - b);
    const count = values.length;
    return { horizonDays, count, meanExcess: count ? values.reduce((sum, value) => sum + value, 0) / count : null,
      medianExcess: count ? (values[Math.floor((count - 1) / 2)] + values[Math.floor(count / 2)]) / 2 : null,
      hitRate: count ? values.filter((value) => value > 0).length / count : null };
  });
}
