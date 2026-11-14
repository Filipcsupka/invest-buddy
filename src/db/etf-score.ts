import type pg from "pg";
import { getPool } from "./pool";
import { etfScore, type EtfScoreFacts, type EtfScoreResult } from "@/engine/etf-score";
import { etfBand } from "@/engine/etf-bands";
import { ETF_RULES_VERSION } from "@/engine/etf-score-config";
import { sampleEtfScores } from "@/data/etf-fixtures";

type Query = Pick<pg.Pool, "query">;
type RecordRow = Record<string, unknown>;
const n = (value: unknown): number | null => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const str = (value: unknown): string | null => value === null || value === undefined ? null : String(value);
const day = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
export interface EtfBar { date: string; close: number; volume: number | null; currency: string | null; high?: number | null; low?: number | null }
export function etfBarFacts(bars: readonly EtfBar[], eurPerUnit: number | null) {
  const sorted = [...bars].filter((b) => b.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const tail = (count: number) => sorted.slice(-count);
  const mean = (count: number) => sorted.length >= count ? tail(count).reduce((sum, b) => sum + b.close, 0) / count : null;
  const close = sorted.at(-1)?.close ?? null;
  const sma50 = mean(50), sma200 = mean(200);
  const return12to1m = sorted.length >= 252 && sorted.at(-22)!.close > 0 ? sorted.at(-22)!.close / sorted.at(-252)!.close - 1 : null;
  const return6m = sorted.length >= 127 && sorted.at(-127)!.close > 0 ? close! / sorted.at(-127)!.close - 1 : null;
  const drawdown = (count: number) => { if (sorted.length < count) return null; let high = 0, worst = 0; for (const b of tail(count)) { high = Math.max(high, b.close); worst = Math.min(worst, b.close / high - 1); } return worst; };
  const recent = tail(20);
  const values = eurPerUnit !== null && recent.length === 20 && recent.every((b) => b.volume !== null && b.volume >= 0) && recent.some((b) => b.volume! > 0) ? recent.map((b) => b.close * b.volume! * eurPerUnit) : [];
  const ranges = recent.length === 20 && recent.every((b) => n(b.high) !== null && n(b.low) !== null && b.high! > 0 && b.low! > 0 && b.high! >= b.low!) ? recent.map((b) => (b.high! - b.low!) / b.close * 100) : [];
  const changes = sorted.slice(-253).map((b, i, a) => i ? Math.log(b.close / a[i - 1].close) : null).filter((x): x is number => x !== null);
  const meanChange = changes.length >= 252 ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
  const volFromBars = meanChange === null ? null : Math.sqrt(changes.reduce((sum, x) => sum + (x - meanChange) ** 2, 0) / (changes.length - 1) * 252) * 100;
  return { barsCount: sorted.length, barDate: sorted.at(-1)?.date ?? null, close, sma50, sma200, return12to1m, return6m,
    maxDrawdown1y: drawdown(252), maxDrawdown3y: drawdown(756), medianValueTradedEur: median(values), medianDailyRangePct: median(ranges), volFromBars };
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
const peerKey = (c: RecordRow) => str(c.category)?.trim().toLowerCase() ? `category:${str(c.category)!.trim().toLowerCase()}` : `class:${str(c.asset_class) ?? "?"}|region:${str(c.region) ?? str(c.listing_region) ?? "?"}`;
/** Full-universe peer ranks are loaded once per score run. Ties have the same rank. */
export async function loadEtfPeerPercentiles(asOf: string, db: Query): Promise<Map<string, number>> {
  const rows = await db.query<RecordRow>(`SELECT c.listing_key,c.asset_class,c.region,c.listing_region,to_jsonb(c)->>'category' AS category,
    COALESCE(s.ongoing_charge_pct,s.net_expense_ratio_pct,c.ter_pct) AS ter_pct
    FROM etf_catalog c LEFT JOIN LATERAL (SELECT ongoing_charge_pct,net_expense_ratio_pct FROM etf_fund_stats
    WHERE listing_key=c.listing_key AND as_of<=$1::date ORDER BY as_of DESC LIMIT 1) s ON true WHERE c.instrument_type='ETF'`, [asOf]);
  const groups = new Map<string, { key: string; ter: number }[]>();
  for (const r of rows.rows) { const ter = n(r.ter_pct); if (ter === null || ter <= 0) continue; const key = peerKey(r); const group = groups.get(key) ?? []; group.push({ key: str(r.listing_key)!, ter }); groups.set(key, group); }
  const out = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.length < 5) continue;
    group.sort((a, b) => a.ter - b.ter);
    for (let i = 0; i < group.length;) {
      let end = i + 1;
      while (end < group.length && group[end].ter === group[i].ter) end++;
      for (let k = i; k < end; k++) out.set(group[k].key, end / group.length * 100);
      i = end;
    }
  }
  return out;
}
const benchmarkSymbol = (c: RecordRow): string => {
  const region = `${str(c.region) ?? ""} ${str(c.listing_region) ?? ""}`.toLowerCase();
  if (/japan/.test(region)) return "N225.INDX";
  if (/hong kong/.test(region)) return "HSI.INDX";
  if (/switzerland|swiss/.test(region)) return "SSMI.INDX";
  if (/germany/.test(region)) return "GDAXI.INDX";
  if (/france/.test(region)) return "FCHI.INDX";
  if (/netherlands/.test(region)) return "AEX.INDX";
  if (/spain/.test(region)) return "IBEX.INDX";
  if (/europe|eu/.test(region)) return "STOXX50E.INDX";
  return "GSPC.INDX";
};
const byKey = (rows: RecordRow[], field = "listing_key") => { const map = new Map<string, RecordRow[]>(); for (const row of rows) { const key = str(row[field]); if (!key) continue; const values = map.get(key) ?? []; values.push(row); map.set(key, values); } return map; };
export async function loadEtfBenchmarkReturns(asOf: string, db: Query): Promise<Map<string, { return6m: number | null; barDate: string | null }>> {
  const result = await db.query<RecordRow>(`SELECT b.vendor_symbol,b.bar_date::text AS date,b.close FROM unnest($1::text[]) sym(vendor_symbol) CROSS JOIN LATERAL (SELECT * FROM asset_bars WHERE vendor_symbol=sym.vendor_symbol AND bar_date<=$2::date ORDER BY bar_date DESC LIMIT 130) b`, [["GSPC.INDX", "STOXX50E.INDX", "GDAXI.INDX", "FCHI.INDX", "AEX.INDX", "IBEX.INDX", "SSMI.INDX", "N225.INDX", "HSI.INDX"], asOf]);
  const grouped = byKey(result.rows, "vendor_symbol");
  return new Map([...grouped].map(([symbol, rows]) => { const facts = etfBarFacts(rows.map((r) => ({ date: day(r.date), close: n(r.close) ?? 0, volume: null, currency: null })), null); return [symbol, { return6m: facts.return6m, barDate: facts.barDate }]; }));
}
/** Bounded batch reader for the nightly job; all dated facts stay on or before asOf. */
export async function readEtfScoreFactsBatch(keys: readonly string[], asOf: string, db: Query, peers = new Map<string, number>(), benchmarkReturns?: Map<string, { return6m: number | null; barDate: string | null }>): Promise<Map<string, EtfScoreFacts>> {
  if (!keys.length) return new Map();
  const catalog = await db.query<RecordRow>(`SELECT c.*,t.vendor_symbol,t.detail_status,t.dividends_fetched_at,to_jsonb(c)->>'category' AS score_category FROM etf_catalog c LEFT JOIN etf_tracked t ON t.listing_key=c.listing_key WHERE c.listing_key=ANY($1::text[])`, [keys]);
  const symbols = [...new Set(catalog.rows.map((c) => str(c.vendor_symbol)).filter((x): x is string => !!x))];
  const [stats, holdings, exposure, bars, dividends, fx, benchmarks] = await Promise.all([
    db.query<RecordRow>(`SELECT DISTINCT ON (listing_key) * FROM etf_fund_stats WHERE listing_key=ANY($1::text[]) AND as_of<=$2::date ORDER BY listing_key,as_of DESC`, [keys, asOf]),
    db.query<RecordRow>(`SELECT listing_key,as_of,weight_pct,country FROM etf_holdings WHERE listing_key=ANY($1::text[]) AND as_of<=$2::date ORDER BY listing_key,weight_pct DESC NULLS LAST`, [keys, asOf]),
    db.query<RecordRow>(`SELECT listing_key,as_of,kind,label,weight_pct FROM etf_exposure WHERE listing_key=ANY($1::text[]) AND as_of<=$2::date`, [keys, asOf]),
    symbols.length ? db.query<RecordRow>(`SELECT b.vendor_symbol,b.bar_date::text AS date,b.close,b.high,b.low,b.volume,b.currency FROM unnest($1::text[]) sym(vendor_symbol) CROSS JOIN LATERAL (SELECT * FROM asset_bars WHERE vendor_symbol=sym.vendor_symbol AND bar_date<=$2::date ORDER BY bar_date DESC LIMIT 760) b`, [symbols, asOf]) : Promise.resolve({ rows: [] as RecordRow[] }),
    symbols.length ? db.query<RecordRow>(`SELECT vendor_symbol,ex_date FROM etf_dividends WHERE vendor_symbol=ANY($1::text[]) AND ex_date<=$2::date AND ex_date>$2::date - 365`, [symbols, asOf]) : Promise.resolve({ rows: [] as RecordRow[] }),
    db.query<RecordRow>(`SELECT close FROM asset_bars WHERE vendor_symbol='EURUSD.FOREX' AND bar_date<=$1::date AND bar_date >= $1::date - 7 ORDER BY bar_date DESC LIMIT 1`, [asOf]),
    benchmarkReturns ? Promise.resolve(benchmarkReturns) : loadEtfBenchmarkReturns(asOf, db),
  ]);
  const statsBy = byKey(stats.rows), holdingsBy = byKey(holdings.rows), exposureBy = byKey(exposure.rows), barsBy = byKey(bars.rows, "vendor_symbol"), dividendsBy = byKey(dividends.rows, "vendor_symbol");
  const fxClose = n(fx.rows[0]?.close); const usdToEur = fxClose && fxClose > 0 ? 1 / fxClose : null;
  const results = new Map<string, EtfScoreFacts>();
  for (const c of catalog.rows) {
    const key = str(c.listing_key)!; const s = statsBy.get(key)?.[0]; const h = holdingsBy.get(key) ?? []; const e = exposureBy.get(key) ?? [];
    const currency = str(s?.total_assets_currency);
    const explicitAum = aumEur(n(s?.total_assets), currency, currency === "EUR" ? 1 : currency === "USD" ? usdToEur : null);
    const usdListing = str(c.listing_region) === "US" && str(c.trading_currency) === "USD";
    const catalogAum = usdListing && (n(c.aum_usd_m) ?? 0) > 0 ? aumEur(n(c.aum_usd_m)! * 1_000_000, "USD", usdToEur) : null;
    const aum = explicitAum.value !== null ? explicitAum : catalogAum?.value !== null && catalogAum !== null ? catalogAum : explicitAum;
    const symbol = str(c.vendor_symbol);
    const barRows: EtfBar[] = (symbol ? barsBy.get(symbol) ?? [] : []).map((r) => ({ date: day(r.date), close: n(r.close) ?? 0, high: n(r.high), low: n(r.low), volume: n(r.volume), currency: str(r.currency) }));
    const lastBar = barRows.filter((b) => b.close > 0).map((b) => b.date).sort().at(-1);
    const barAge = lastBar ? Date.parse(asOf) - Date.parse(lastBar) : NaN;
    const freshBars = barAge >= 0 && barAge <= 7 * 86_400_000 ? barRows : [];
    const barCurrency = str(c.trading_currency);
    const barFx = barCurrency === "EUR" ? 1 : barCurrency === "USD" ? usdToEur : null;
    const validBarFx = barRows.every((b) => !b.currency || b.currency === barCurrency) ? barFx : null;
    const topTen = h.length >= 10 && h.slice(0, 10).every((r) => n(r.weight_pct) !== null) ? h.slice(0, 10).reduce((sum, r) => sum + n(r.weight_pct)!, 0) : null;
    const countryWeights = new Map<string, number>();
    for (const r of h) if (str(r.country) && n(r.weight_pct) !== null) countryWeights.set(str(r.country)!, (countryWeights.get(str(r.country)!) ?? 0) + n(r.weight_pct)!);
    const maxCountry = countryWeights.size ? Math.max(...countryWeights.values()) : null;
    const completeCountries = h.length > 0 && h.every((r) => str(r.country) && n(r.weight_pct) !== null) && h.reduce((sum, r) => sum + n(r.weight_pct)!, 0) >= 99.99;
    const regions = e.filter((r) => r.kind === "region").map((r) => n(r.weight_pct)).filter((x): x is number => x !== null);
    const sectors = e.filter((r) => r.kind === "sector").map((r) => n(r.weight_pct)).filter((x): x is number => x !== null);
    const benchmark = benchmarks.get(benchmarkSymbol(c));
    const benchmarkFresh = benchmark?.barDate && lastBar && Math.abs(Date.parse(lastBar) - Date.parse(benchmark.barDate)) <= 7 * 86_400_000;
    const barFacts = etfBarFacts(freshBars, validBarFx);
    const payload = s?.payload && typeof s.payload === "object" ? s.payload as RecordRow : null;
    const etfData = payload?.ETF_Data && typeof payload.ETF_Data === "object" ? payload.ETF_Data as RecordRow : null;
    const rawRatio = n(etfData?.NetExpenseRatio ?? payload?.NetExpenseRatio);
    const terGapReason = rawRatio !== null && rawRatio >= 0.01 && rawRatio <= 0.025 && n(s?.ongoing_charge_pct) === null && n(s?.net_expense_ratio_pct) === null && n(c.ter_pct) === null ? "ter_ambiguous" : null;
    const ucits = c.ucits === true ? true : c.ucits === false ? false : null;
    results.set(key, { asOf, instrumentType: str(c.instrument_type) ?? "", name: str(c.name) ?? "", riskType: str(c.theme), detailStatus: str(c.detail_status), lastSeen: day(c.last_seen),
      terPct: n(s?.ongoing_charge_pct) ?? n(s?.net_expense_ratio_pct) ?? n(c.ter_pct), terGapReason, terDate: s ? day(s.as_of) : day(c.last_seen), peerPercentile: peers.get(key) ?? null,
      aumEur: aum.value, aumCurrencyReason: aum.reason, aumDate: aum === catalogAum ? day(c.last_seen) : s ? day(s.as_of) : null,
      replication: str(c.replication), ucitsConfirmed: ucits, inceptionDate: s?.inception_date ? day(s.inception_date) : null,
      domicile: str(c.domicile), assetClass: str(c.asset_class), usEquityWeightPct: usEquityWeight(e, h), trackedIndex: str(c.tracked_index), category: str(c.score_category), distribution: str(c.distribution), catalogDate: day(c.last_seen),
      ...barFacts, benchmarkReturn6m: benchmarkFresh ? benchmark!.return6m : null, vol1yPct: n(s?.vol_1y_pct) ?? barFacts.volFromBars, sharpe3y: n(s?.sharpe_3y),
      retYtdPct: n(s?.ret_ytd_pct), ret1yPct: n(s?.ret_1y_pct), ret3yPct: n(s?.ret_3y_pct), ret5yPct: n(s?.ret_5y_pct), ret10yPct: n(s?.ret_10y_pct),
      topTenWeightPct: topTen, maxCountryWeightPct: completeCountries ? maxCountry : regions.length ? Math.max(...regions) : (maxCountry ?? 0) > 80 ? maxCountry : null,
      maxSectorWeightPct: sectors.length ? Math.max(...sectors) : null, holdingsCount: n(s?.holdings_count), holdingsListed: n(s?.holdings_listed),
      yieldPct: n(s?.yield_pct), dividendFrequency: str(s?.dividend_frequency), dividendsLast12m: symbol && c.dividends_fetched_at ? (dividendsBy.get(symbol) ?? []).length : null,
      statsDate: s ? day(s.as_of) : null, holdingsDate: h[0] ? day(h[0].as_of) : null, exposureDate: e[0] ? day(e[0].as_of) : null });
  }
  return results;
}
export async function readEtfScoreFacts(listingKey: string, asOf: string, db: Query | null = getPool()): Promise<EtfScoreFacts | null> {
  if (!db) return null;
  return (await readEtfScoreFactsBatch([listingKey], asOf, db)).get(listingKey) ?? null;
}
export async function latestEtfScores(keys: readonly string[], db: Query | null = getPool()): Promise<Map<string, EtfScoreResult>> {
  if (process.env.DATA_MODE === "fixture") return new Map(keys.flatMap((key) => { const score = sampleEtfScores.get(key); return score ? [[key, score] as const] : []; }));
  if (!db || !keys.length) return new Map();
  const result = await db.query<{ listing_key: string; rules_version: string; rule_hits: EtfScoreResult["rules"]; earned: number; evidenced_max: number; state: EtfScoreResult["state"]; rejections: string[]; concentration: EtfScoreResult["concentration"] }>(`SELECT DISTINCT ON (listing_key) listing_key,rules_version,rule_hits,earned,evidenced_max,state,rejections,concentration FROM etf_scores WHERE listing_key=ANY($1::text[]) AND rules_version=$2 ORDER BY listing_key,as_of DESC`, [keys, ETF_RULES_VERSION]);
  return new Map(result.rows.map((r) => { const earned = Number(r.earned), evidencedMax = Number(r.evidenced_max); const percent = r.state === "rated" && evidencedMax > 0 ? Math.round(earned / evidencedMax * 100) : null; return [r.listing_key, { rulesVersion: r.rules_version, rules: r.rule_hits, earned, evidencedMax, percent, state: r.state, rejections: r.rejections, concentration: r.concentration, ...(percent === null ? { band: null, incompleteData: evidencedMax < 70 } : etfBand(percent, evidencedMax)) }]; }));
}
export async function storeEtfScore(listingKey: string, asOf: string, score: EtfScoreResult, db: Query): Promise<void> {
  await db.query(`INSERT INTO etf_scores(listing_key,as_of,rules_version,rule_hits,earned,evidenced_max,state,rejections,concentration) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9::jsonb) ON CONFLICT(listing_key,as_of,rules_version) DO UPDATE SET rule_hits=EXCLUDED.rule_hits,earned=EXCLUDED.earned,evidenced_max=EXCLUDED.evidenced_max,state=EXCLUDED.state,rejections=EXCLUDED.rejections,concentration=EXCLUDED.concentration`,
    [listingKey, asOf, score.rulesVersion, JSON.stringify(score.rules), score.earned, score.evidencedMax, score.state, JSON.stringify(score.rejections), JSON.stringify(score.concentration)]);
}
export async function scoreEtfListing(key: string, asOf: string, db: Query) { const facts = await readEtfScoreFacts(key, asOf, db); return facts ? etfScore(facts) : null; }
