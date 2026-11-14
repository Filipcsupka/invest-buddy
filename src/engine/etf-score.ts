import { ETF_RULES_VERSION, ETF_SCORE_BANDS as B } from "./etf-score-config";
import { etfBand, type EtfBand } from "./etf-bands";

export type ReplicationKind = "full" | "sampling" | "fund_of_funds" | "synthetic" | "overlay" | null;
/** Catalog replication is stored free text, not issuer-confirmed. */
export function normalizeReplication(raw: string | null | undefined): ReplicationKind {
  const value = raw?.trim().toLowerCase() ?? "";
  if (!value) return null;
  if (/\b(?:options?[ -]?(?:overlay|income|strategy)|covered[ -]?call|buffer|flex[ -]?options?|leverag(?:e|ed|ing)|inverse|[2-9]x|1\.5x)\b|(?:^|[^\w])-1x\b/.test(value)) return "overlay";
  if (/\bnon[ -]?physical\b/.test(value)) return "synthetic";
  if (/\bnon[ -]?synthetic\b/.test(value)) return "full";
  if (/\b(?:fund of funds?|fund of etfs?|etf of etfs?)\b/.test(value)) return "fund_of_funds";
  if (/\b(?:sampl(?:e|ed|ing)|optimis(?:e|ed)|optimiz(?:e|ed))\b/.test(value)) return "sampling";
  if (/\b(?:physical|physically(?: backed)?|full(?: replication| replicate| replication)?|full replicat(?:e|ion))\b/.test(value)) return "full";
  if (/\b(?:synthetic|swap)\b/.test(value)) return "synthetic";
  if (/\bderivatives?\b/.test(value.replace(/\bderivatives?\s+for\s+(?:efficient portfolio management|(?:portfolio )?hedging)\b/g, ""))) return "synthetic";
  return null;
}

export type EtfGroup = "cost" | "size" | "liquidity" | "structure" | "diversification" | "trend" | "risk" | "income";
export type EtfGap = "ter" | "aum" | "liquidity" | "age" | "structure" | "wrapper" | "priceHistory";
export interface EtfRuleHit {
  id: string; group: EtfGroup; max: number; earned: number; evidenced: boolean;
  threshold?: string; value?: number | string | boolean | null; date?: string | null;
  gapReason?: string; reason?: string;
}
export interface EtfScoreFacts {
  asOf: string; instrumentType: string; name: string; riskType?: string | null;
  detailStatus: string | null; lastSeen: string; terPct: number | null;
  terGapReason?: string | null; terDate?: string | null; peerPercentile?: number | null;
  aumEur: number | null; aumCurrencyReason?: string | null; aumDate?: string | null;
  medianValueTradedEur: number | null; medianDailyRangePct?: number | null; barDate?: string | null;
  replication: string | null; ucitsConfirmed: boolean | null; inceptionDate: string | null;
  domicile: string | null; assetClass: string | null; usEquityWeightPct: number | null;
  trackedIndex?: string | null; category?: string | null; distribution?: string | null; catalogDate?: string | null;
  barsCount: number; close: number | null; sma50: number | null; sma200: number | null;
  return12to1m: number | null; return6m?: number | null; benchmarkReturn6m?: number | null;
  maxDrawdown1y: number | null; maxDrawdown3y?: number | null;
  vol1yPct?: number | null; sharpe3y?: number | null;
  retYtdPct?: number | null; ret1yPct?: number | null; ret3yPct?: number | null; ret5yPct?: number | null; ret10yPct?: number | null;
  topTenWeightPct: number | null; maxCountryWeightPct: number | null; maxSectorWeightPct: number | null;
  holdingsCount: number | null; holdingsListed?: number | null;
  yieldPct?: number | null; dividendFrequency?: string | null; dividendsLast12m?: number | null;
  statsDate?: string | null; holdingsDate?: string | null; exposureDate?: string | null;
}
export interface EtfScoreResult {
  rulesVersion: string; rules: EtfRuleHit[]; earned: number; evidencedMax: number; percent: number | null;
  state: "rated" | "not_rated"; rejections: string[]; band?: EtfBand | null; incompleteData?: boolean;
  concentration: { topTenWeightPct: number | null; maxCountryWeightPct: number | null; maxSectorWeightPct: number | null; holdingsCount: number | null; concentrated: boolean };
}
const known = (n: number | null | undefined): n is number => n !== null && n !== undefined && Number.isFinite(n);
const days = (end: string, start: string) => (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
const years = (end: string, start: string) => Number(end.slice(0, 4)) - Number(start.slice(0, 4)) - (end.slice(5) < start.slice(5) ? 1 : 0);
const descending = (value: number, bands: readonly (readonly [number, number])[]) => bands.find(([min]) => value >= min)?.[1] ?? 0;
const ascending = (value: number, bands: readonly (readonly [number, number])[]) => bands.find(([max]) => value <= max)?.[1] ?? 0;
const domicileCode = (raw: string | null): string | null => {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  return ({ ireland: "IE", irland: "IE", luxembourg: "LU", luxemburg: "LU", germany: "DE", deutschland: "DE", france: "FR", netherlands: "NL", holland: "NL" } as Record<string, string>)[value] ?? value.toUpperCase();
};

export function etfScoreCoverage(rules: readonly EtfRuleHit[]) {
  const groupsWithData = new Set(rules.filter((r) => r.evidenced).map((r) => r.group)).size;
  const has = (id: string) => rules.some((r) => r.id === id && r.evidenced);
  const gaps: EtfGap[] = [];
  if (!has("ter")) gaps.push("ter");
  if (!has("aum")) gaps.push("aum");
  if (!has("liquidity")) gaps.push("liquidity");
  if (!has("age")) gaps.push("age");
  if (!has("replication")) gaps.push("structure");
  if (!has("ucits")) gaps.push("wrapper");
  if (!rules.some((r) => r.group === "trend" && r.evidenced)) gaps.push("priceHistory");
  return { groupsWithData, gaps };
}
export function etfScoreStatus(result: Pick<EtfScoreResult, "state" | "rejections" | "rules" | "percent" | "evidencedMax">): EtfBand | "caution" | "rejected" | "outOfScope" | "trendBroken" | "insufficient" {
  if (result.rejections.some((r) => ["not_etf_instrument", "leveraged_inverse_daily_reset", "options_overlay"].includes(r))) return "outOfScope";
  if (result.rejections.some((r) => ["ter_over_1_5", "liquidity_under_100k_eur", "age_under_one_year", "aum_under_20m_eur", "isin_mismatch", "not_etf", "stale_listing"].includes(r))) return "rejected";
  if (result.rejections.includes("trend_broken")) return "trendBroken";
  if (result.state === "not_rated" || result.percent === null) return "insufficient";
  if (result.rules.some((r) => r.id === "aum" && r.reason === "aum_under_50m_eur")) return "caution";
  return etfBand(result.percent, result.evidencedMax).band;
}

export function etfScore(f: EtfScoreFacts): EtfScoreResult {
  const rules: EtfRuleHit[] = [];
  const add = (id: string, group: EtfGroup, max: number, earned: number | null, threshold: string, value: EtfRuleHit["value"], date: string | null | undefined, gapReason = `missing_${id}`) => {
    rules.push({ id, group, max, earned: earned ?? 0, evidenced: earned !== null, threshold, value: value ?? null, date: date ?? null,
      ...(earned === null ? { gapReason, reason: gapReason } : {}) });
    return rules[rules.length - 1];
  };
  const ter = known(f.terPct) && f.terPct > 0;
  add("ter", "cost", 12, ter ? ascending(f.terPct!, B.ter) : null, "TER ≤0.10/0.20/0.30/0.50/0.75%", f.terPct, f.terDate, f.terGapReason ?? "missing_ter");
  add("peerTer", "cost", 8, ter && known(f.peerPercentile) ? ascending(f.peerPercentile!, B.peer) : null, "peer percentile ≤25/50/75; at least 5 peers", f.peerPercentile, f.terDate, !ter ? "missing_ter" : "insufficient_peers");
  const aum = add("aum", "size", 8, known(f.aumEur) && f.aumEur > 0 ? descending(f.aumEur, B.aum) : null, "AUM ≥1bn/500m/250m/100m/50m EUR", f.aumEur, f.aumDate, f.aumCurrencyReason ?? "missing_aum");
  if (aum.evidenced && f.aumEur! < 50_000_000) aum.reason = "aum_under_50m_eur";
  const age = f.inceptionDate ? years(f.asOf, f.inceptionDate) : null;
  add("age", "size", 4, age !== null && Number.isFinite(age) && age >= 0 ? descending(age, B.age) : null, "age ≥5/3/1 years", age, f.inceptionDate);
  add("liquidity", "liquidity", 8, known(f.medianValueTradedEur) && f.medianValueTradedEur > 0 ? descending(f.medianValueTradedEur, B.liquidity) : null, "median 20-day traded value ≥5m/1m/250k/100k EUR", f.medianValueTradedEur, f.barDate);
  add("dailyRange", "liquidity", 4, known(f.medianDailyRangePct) ? f.medianDailyRangePct <= 0.5 ? 4 : f.medianDailyRangePct <= 1 ? 2 : 0 : null, "median 20-day daily range proxy ≤0.5/1%", f.medianDailyRangePct, f.barDate);
  const replication = normalizeReplication(f.replication);
  add("replication", "structure", 4, replication === "full" ? 4 : replication === "sampling" || replication === "fund_of_funds" ? 3 : replication === "synthetic" ? 1 : replication === "overlay" ? 0 : null, "full 4; sampled/fund of funds 3; synthetic 1", f.replication, f.catalogDate ?? f.asOf);
  const domicile = domicileCode(f.domicile);
  const fallbackWrapper = /^(IE|LU|DE|FR|NL)$/.test(domicile ?? "");
  add("ucits", "structure", 3, f.ucitsConfirmed === null ? fallbackWrapper ? 2 : null : f.ucitsConfirmed ? 3 : 0, "catalog UCITS hint 3; eligible domicile fallback 2", f.ucitsConfirmed ?? f.domicile, f.catalogDate ?? f.asOf);
  const domicileEvidence = f.assetClass === "equity" && f.usEquityWeightPct === null ? null : f.domicile;
  add("domicile", "structure", 2, domicileEvidence === null ? null : f.assetClass === "equity" && (f.usEquityWeightPct ?? 0) > 50 ? domicile === "IE" ? 2 : 0 : 2, "US equity weight >50%: IE; otherwise domicile present", f.domicile, f.exposureDate ?? f.catalogDate ?? f.asOf);
  add("indexTracked", "structure", 1, f.trackedIndex ? 1 : null, "named tracked index", f.trackedIndex, f.catalogDate ?? f.asOf);
  const holdingsReliable = known(f.holdingsCount) && f.holdingsCount > 0 && !(f.holdingsCount <= 10 && f.holdingsCount === f.holdingsListed);
  add("holdingsCount", "diversification", 4, holdingsReliable ? descending(f.holdingsCount!, [[100, 4], [50, 3], [20, 2]]) : null, "holdings ≥100/50/20", f.holdingsCount, f.statsDate, "truncated_holdings_count");
  add("topTen", "diversification", 4, known(f.topTenWeightPct) ? f.topTenWeightPct <= 20 ? 4 : f.topTenWeightPct <= 35 ? 3 : f.topTenWeightPct <= 50 ? 2 : 0 : null, "top ten weight ≤20/35/50%", f.topTenWeightPct, f.holdingsDate);
  add("largestSector", "diversification", 3, known(f.maxSectorWeightPct) ? f.maxSectorWeightPct <= 30 ? 3 : f.maxSectorWeightPct <= 50 ? 2 : 0 : null, "largest sector ≤30/50%", f.maxSectorWeightPct, f.exposureDate);
  add("largestRegion", "diversification", 3, known(f.maxCountryWeightPct) ? f.maxCountryWeightPct <= 60 ? 3 : f.maxCountryWeightPct <= 80 ? 2 : 0 : null, "largest country or region ≤60/80%", f.maxCountryWeightPct, f.exposureDate ?? f.holdingsDate);
  const hasTrend = f.barsCount >= 200;
  add("sma200", "trend", 3, hasTrend && known(f.close) && known(f.sma200) && f.sma200 > 0 ? f.close > f.sma200 * (1 + B.smaBand) ? 3 : 0 : null, "close >200-day SMA by 2%", f.close, f.barDate);
  add("sma50", "trend", 2, hasTrend && known(f.sma50) && known(f.sma200) ? f.sma50 > f.sma200 ? 2 : 0 : null, "50-day SMA >200-day SMA", f.sma50, f.barDate);
  add("return12to1m", "trend", 3, known(f.return12to1m) ? f.return12to1m > 0 ? 3 : 0 : null, "12-to-1-month return >0", f.return12to1m, f.barDate);
  add("benchmark6m", "trend", 4, f.assetClass === "equity" ? known(f.return6m) && known(f.benchmarkReturn6m) ? f.return6m > f.benchmarkReturn6m ? 4 : 0 : null : null, "6-month return >benchmark proxy", f.return6m, f.barDate, f.assetClass === "equity" ? "missing_benchmark_proxy" : "not_applicable");
  const bond = f.assetClass === "bond";
  add("volatility1y", "risk", 4, known(f.vol1yPct) ? f.vol1yPct <= (bond ? 5 : 15) ? 4 : f.vol1yPct <= (bond ? 8 : 20) ? 3 : f.vol1yPct <= (bond ? 12 : 25) ? 1 : 0 : null, bond ? "1-year volatility ≤5/8/12%" : "1-year volatility ≤15/20/25%", f.vol1yPct, f.statsDate);
  add("sharpe3y", "risk", 4, known(f.sharpe3y) ? f.sharpe3y >= 1 ? 4 : f.sharpe3y >= 0.5 ? 3 : f.sharpe3y >= 0 ? 1 : 0 : null, "3-year Sharpe ≥1/0.5/0", f.sharpe3y, f.statsDate);
  add("drawdown3y", "risk", 4, known(f.maxDrawdown3y) ? f.maxDrawdown3y > (bond ? -0.10 : -0.20) ? 4 : f.maxDrawdown3y > (bond ? -0.15 : -0.30) ? 2 : 0 : null, bond ? "3-year drawdown better than -10/-15%" : "3-year drawdown better than -20/-30%", f.maxDrawdown3y, f.barDate);
  const distributing = /^(dist|distributing)$/i.test(f.distribution ?? "");
  if (distributing) {
    add("yield", "income", 4, known(f.yieldPct) && f.yieldPct >= 0 ? f.yieldPct >= 1.5 ? 4 : f.yieldPct >= 0.5 ? 2 : 0 : null, "yield ≥1.5/0.5%", f.yieldPct, f.statsDate);
    const stated = !!f.dividendFrequency && !/^(na|n\/a|none|unknown)$/i.test(f.dividendFrequency.trim());
    add("payoutRegularity", "income", 4, known(f.dividendsLast12m) || stated ? (f.dividendsLast12m ?? 0) >= 4 || stated ? 4 : 0 : null, "≥4 payments in 12 months or stated frequency", f.dividendsLast12m ?? f.dividendFrequency, f.statsDate);
  }
  const rejections: string[] = [];
  const scopeText = `${f.name} ${f.riskType ?? ""}`;
  if (/\b(?:leveraged(?![ -]?loan\b)|inverse|bear|daily[ -]?reset|flex[ -]?options?|covered[ -]?call|buffer|options?[ -]?(?:overlay|income|strategy)|levdax|ultra(?:short|pro)\b|ultra(?![ -]?(?:short|term|duration)\b)|[2-9]\d*x|x[2-9]\d*|1\.5x)\b|(?:^|[^\w])-1x\b|\bshort(?:[ -]?(?:s&p\s?\d+|qqq|dow\s?\d+|dax\b|nasdaq\b|russell\b|ftse\b)|\b(?=[^,;]{0,50}\b(?:index|daily)\b))/i.test(scopeText)) rejections.push("leveraged_inverse_daily_reset");
  if (replication === "overlay") rejections.push("options_overlay");
  if (f.instrumentType === "ETC" || f.instrumentType === "ETN") rejections.push("not_etf_instrument");
  if (known(f.terPct) && f.terPct > 1.5) rejections.push("ter_over_1_5");
  if (known(f.medianValueTradedEur) && f.medianValueTradedEur > 0 && f.medianValueTradedEur < 100_000) rejections.push("liquidity_under_100k_eur");
  if (age !== null && age >= 0 && age < 1) rejections.push("age_under_one_year");
  if (known(f.aumEur) && f.aumEur > 0 && f.aumEur < 20_000_000) rejections.push("aum_under_20m_eur");
  if (f.detailStatus === "isin_mismatch" || f.detailStatus === "not_etf") rejections.push(f.detailStatus);
  if (f.lastSeen && days(f.asOf, f.lastSeen) > 30) rejections.push("stale_listing");
  if (hasTrend && known(f.close) && known(f.sma50) && known(f.sma200) && f.close < f.sma50 && f.close < f.sma200) rejections.push("trend_broken");
  const earned = rules.reduce((sum, rule) => sum + rule.earned, 0);
  const evidencedMax = rules.reduce((sum, rule) => sum + (rule.evidenced ? rule.max : 0), 0);
  const group = (name: EtfGroup) => rules.some((rule) => rule.group === name && rule.evidenced);
  const supportingGroups = (["liquidity", "structure", "diversification", "trend", "risk"] as const).filter(group).length;
  if (!group("cost") || !group("size") || supportingGroups < 2) rejections.push("insufficient_evidence");
  const state = rejections.length ? "not_rated" : "rated";
  const percent = state === "rated" && evidencedMax > 0 ? Math.round(earned / evidencedMax * 100) : null;
  const { band, incompleteData } = percent === null ? { band: null, incompleteData: evidencedMax < 70 } : etfBand(percent, evidencedMax);
  return { rulesVersion: ETF_RULES_VERSION, rules, earned, evidencedMax, percent, state, rejections, band, incompleteData,
    concentration: { topTenWeightPct: f.topTenWeightPct, maxCountryWeightPct: f.maxCountryWeightPct, maxSectorWeightPct: f.maxSectorWeightPct, holdingsCount: f.holdingsCount,
      concentrated: (f.topTenWeightPct ?? 0) > B.topTenConcentration || (f.maxCountryWeightPct ?? 0) > B.countryConcentration } };
}
