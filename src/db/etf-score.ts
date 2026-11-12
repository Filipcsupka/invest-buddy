import type pg from "pg";
import { getPool } from "./pool";
import { etfScore, type EtfScoreFacts, type EtfScoreResult } from "@/engine/etf-score";
import { ETF_RULES_VERSION } from "@/engine/etf-score-config";
import { sampleEtfScores } from "@/data/etf-fixtures";

type Query = Pick<pg.Pool, "query">;
type RecordRow = Record<string, unknown>;
const n = (value: unknown): number | null => value === null || value === undefined ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const str = (value: unknown): string | null => value === null || value === undefined ? null : String(value);
const day = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
export interface EtfBar { date: string; close: number; volume: number | null; currency: string | null }
export function etfBarFacts(bars: readonly EtfBar[], eurPerUnit: number | null) {
  const sorted = [...bars].filter((b) => b.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const tail = (count: number) => sorted.slice(-count);
  const mean = (count: number) => sorted.length >= count ? tail(count).reduce((sum, b) => sum + b.close, 0) / count : null;
  const close = sorted.at(-1)?.close ?? null;
  const sma50 = mean(50), sma200 = mean(200);
  const return12to1m = sorted.length >= 252 && sorted.at(-22)!.close > 0 ? sorted.at(-22)!.close / sorted.at(-252)!.close - 1 : null;
  const year = tail(252);
  let high = 0, maxDrawdown1y: number | null = sorted.length >= 252 ? 0 : null;
  for (const bar of year) { high = Math.max(high, bar.close); if (maxDrawdown1y !== null) maxDrawdown1y = Math.min(maxDrawdown1y, bar.close / high - 1); }
  const recent = tail(20);
  const values = eurPerUnit !== null && recent.length === 20 && recent.every((b) => b.volume !== null && b.volume >= 0) && recent.some((b) => b.volume! > 0) ? recent.map((b) => b.close * b.volume! * eurPerUnit).sort((a, b) => a - b) : [];
  const medianValueTradedEur = values.length === 20 ? (values[9] + values[10]) / 2 : null;
  return { barsCount: sorted.length, close, sma50, sma200, return12to1m, maxDrawdown1y, medianValueTradedEur };
}
export function aumEur(totalAssets: number | null, explicitCurrency: string | null, eurPerUnit: number | null) {
  if (totalAssets === null) return { value: null, reason: "missing_aum" };
  if (!explicitCurrency) return { value: null, reason: "ambiguous_aum_currency" };
  if (explicitCurrency === "EUR") return { value: totalAssets, reason: null };
  if (eurPerUnit === null) return { value: null, reason: "missing_fx" };
  return { value: totalAssets * eurPerUnit, reason: null };
}
/** Regional totals are bounds, not US weights. Partial holdings can only prove a majority. */
export function usEquityWeight(exposure: RecordRow[], holdings: RecordRow[]): number | null {
  const direct = exposure.find((r) => r.kind === "region" && /^(united states|us|usa)$/i.test(str(r.label) ?? ""));
  if (direct) return n(direct.weight_pct);
  const usLower = holdings.filter((r) => /^(united states|us|usa)$/i.test(str(r.country) ?? "")).reduce((sum, r) => sum + (n(r.weight_pct) ?? 0), 0);
  if (usLower > 50) return usLower;
  const northAmerica = exposure.find((r) => r.kind === "region" && /^north america$/i.test(str(r.label) ?? ""));
  const upper = n(northAmerica?.weight_pct);
  return upper !== null && upper <= 50 ? upper : null;
}
/** Point-in-time inputs. Latest detail, holdings and exposure must be on or before asOf. */
export async function readEtfScoreFacts(listingKey: string, asOf: string, db: Query | null = getPool()): Promise<EtfScoreFacts | null> {
  if (!db) return null;
  const catalog = await db.query<RecordRow>(`SELECT c.*,t.vendor_symbol,t.detail_status FROM etf_catalog c LEFT JOIN etf_tracked t ON t.listing_key=c.listing_key WHERE c.listing_key=$1`, [listingKey]);
  const c = catalog.rows[0]; if (!c) return null;
  const [stats, holdings, exposure, bars, fx] = await Promise.all([
    db.query<RecordRow>(`SELECT * FROM etf_fund_stats WHERE listing_key=$1 AND as_of<=$2::date ORDER BY as_of DESC LIMIT 1`, [listingKey, asOf]),
    db.query<RecordRow>(`SELECT weight_pct,country FROM etf_holdings WHERE listing_key=$1 AND as_of<=$2::date ORDER BY weight_pct DESC NULLS LAST`, [listingKey, asOf]),
    db.query<RecordRow>(`SELECT kind,label,weight_pct FROM etf_exposure WHERE listing_key=$1 AND as_of<=$2::date`, [listingKey, asOf]),
    c.vendor_symbol ? db.query<RecordRow>(`SELECT bar_date::text AS date,close,volume,currency FROM asset_bars WHERE vendor_symbol=$1 AND bar_date<=$2::date ORDER BY bar_date DESC LIMIT 260`, [c.vendor_symbol, asOf]) : Promise.resolve({ rows: [] as RecordRow[] }),
    db.query<RecordRow>(`SELECT close FROM asset_bars WHERE vendor_symbol='EURUSD.FOREX' AND bar_date<=$1::date AND bar_date >= $1::date - 7 ORDER BY bar_date DESC LIMIT 1`, [asOf]),
  ]);
  const s = stats.rows[0];
  const currency = str(s?.total_assets_currency);
  const eurPerUnit = currency === "EUR" ? 1 : currency === "USD" && n(fx.rows[0]?.close) ? 1 / n(fx.rows[0]?.close)! : null;
  const explicitAum = aumEur(n(s?.total_assets), currency, eurPerUnit);
  const usdListing = str(c.listing_region) === "US" && str(c.trading_currency) === "USD";
  const catalogAum = usdListing && (n(c.aum_usd_m) ?? 0) > 0 ? aumEur(n(c.aum_usd_m)! * 1_000_000, "USD", n(fx.rows[0]?.close) ? 1 / n(fx.rows[0]?.close)! : null) : null;
  const aum = explicitAum.value !== null ? explicitAum : catalogAum?.value !== null && catalogAum !== null ? catalogAum : explicitAum;
  const barRows = bars.rows.map((r) => ({ date: day(r.date), close: n(r.close) ?? 0, volume: n(r.volume), currency: str(r.currency) }));
  const lastBar = barRows.filter((b) => b.close > 0).map((b) => b.date).sort().at(-1);
  const barAge = lastBar ? Date.parse(asOf) - Date.parse(lastBar) : NaN;
  const freshBars = barAge >= 0 && barAge <= 7 * 86_400_000 ? barRows : [];
  const barCurrency = str(c.trading_currency);
  const barFx = barCurrency === "EUR" ? 1 : barCurrency === "USD" && n(fx.rows[0]?.close) ? 1 / n(fx.rows[0]?.close)! : null;
  const validBarFx = barRows.every((b) => !b.currency || b.currency === barCurrency) ? barFx : null;
  const h = holdings.rows;
  const topTen = h.length >= 10 && h.slice(0, 10).every((r) => n(r.weight_pct) !== null) ? h.slice(0, 10).reduce((sum, r) => sum + n(r.weight_pct)!, 0) : null;
  const countryWeights = new Map<string, number>();
  for (const r of h) if (str(r.country) && n(r.weight_pct) !== null) countryWeights.set(str(r.country)!, (countryWeights.get(str(r.country)!) ?? 0) + n(r.weight_pct)!);
  const maxCountry = countryWeights.size ? Math.max(...countryWeights.values()) : null;
  // Holdings_Count can itself be truncated by the provider. Require portfolio weight coverage.
  const completeCountries = h.every((r) => str(r.country) && n(r.weight_pct) !== null) && h.reduce((sum, r) => sum + n(r.weight_pct)!, 0) >= 99.99;
  const sector = exposure.rows.filter((r) => r.kind === "sector").map((r) => n(r.weight_pct) ?? 0);

  return { asOf, instrumentType: str(c.instrument_type) ?? "", name: str(c.name) ?? "", riskType: str(c.theme), detailStatus: str(c.detail_status), lastSeen: day(c.last_seen),
    terPct: n(s?.ongoing_charge_pct) ?? n(s?.net_expense_ratio_pct) ?? n(c.ter_pct), aumEur: aum.value, aumCurrencyReason: aum.reason,
    replication: str(c.replication), ucitsConfirmed: null, inceptionDate: s?.inception_date ? day(s.inception_date) : null,
    domicile: str(c.domicile), assetClass: str(c.asset_class), usEquityWeightPct: usEquityWeight(exposure.rows, h),
    ...etfBarFacts(freshBars, validBarFx), topTenWeightPct: topTen, maxCountryWeightPct: completeCountries || (maxCountry ?? 0) > 70 ? maxCountry : null,
    maxSectorWeightPct: sector.length ? Math.max(...sector) : null, holdingsCount: n(s?.holdings_count) };
}
export async function latestEtfScores(keys: readonly string[], db: Query | null = getPool()): Promise<Map<string, EtfScoreResult>> {
  if (process.env.DATA_MODE === "fixture") return new Map(keys.flatMap((key) => {
    const score = sampleEtfScores.get(key);
    return score ? [[key, score] as const] : [];
  }));
  if (!db || !keys.length) return new Map();
  const result = await db.query<{ listing_key: string; rules_version: string; rule_hits: EtfScoreResult["rules"]; earned: number; evidenced_max: number; state: EtfScoreResult["state"]; rejections: string[]; concentration: EtfScoreResult["concentration"] }>(`SELECT DISTINCT ON (listing_key) listing_key,rules_version,rule_hits,earned,evidenced_max,state,rejections,concentration FROM etf_scores WHERE listing_key=ANY($1::text[]) AND rules_version=$2 ORDER BY listing_key,as_of DESC`, [keys, ETF_RULES_VERSION]);
  return new Map(result.rows.map((r) => [r.listing_key, { rulesVersion: r.rules_version, rules: r.rule_hits, earned: Number(r.earned), evidencedMax: Number(r.evidenced_max), percent: r.state === "rated" ? Math.round(Number(r.earned) / Number(r.evidenced_max) * 100) : null, state: r.state, rejections: r.rejections, concentration: r.concentration }]));
}
export async function storeEtfScore(listingKey: string, asOf: string, score: EtfScoreResult, db: Query): Promise<void> {
  await db.query(`INSERT INTO etf_scores(listing_key,as_of,rules_version,rule_hits,earned,evidenced_max,state,rejections,concentration) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9::jsonb) ON CONFLICT(listing_key,as_of,rules_version) DO UPDATE SET rule_hits=EXCLUDED.rule_hits,earned=EXCLUDED.earned,evidenced_max=EXCLUDED.evidenced_max,state=EXCLUDED.state,rejections=EXCLUDED.rejections,concentration=EXCLUDED.concentration`,
    [listingKey, asOf, score.rulesVersion, JSON.stringify(score.rules), score.earned, score.evidencedMax, score.state, JSON.stringify(score.rejections), JSON.stringify(score.concentration)]);
}
export async function scoreEtfListing(key: string, asOf: string, db: Query) { const facts = await readEtfScoreFacts(key, asOf, db); return facts ? etfScore(facts) : null; }
