import { ETF_RULES_VERSION, ETF_SCORE_BANDS as B } from "./etf-score-config";

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

export type EtfGap = "ter" | "aum" | "liquidity" | "age" | "structure" | "wrapper" | "priceHistory";
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

export function etfScoreStatus(result: Pick<EtfScoreResult, "state" | "rejections" | "rules">): "rulesMet" | "caution" | "rejected" | "outOfScope" | "trendBroken" | "insufficient" {
  if (result.rejections.some((r) => r === "not_etf_instrument" || r === "leveraged_inverse_daily_reset" || r === "options_overlay")) return "outOfScope";
  if (result.rejections.some((r) => r === "ter_over_1_5" || r === "liquidity_under_100k_eur" || r === "age_under_one_year" || r === "aum_under_20m_eur" || r === "isin_mismatch" || r === "not_etf" || r === "stale_listing")) return "rejected";
  if (result.rejections.includes("trend_broken")) return "trendBroken";
  if (result.state === "not_rated") return "insufficient";
  return result.rules.some((r) => r.id === "aum" && r.reason === "aum_under_50m_eur") ? "caution" : "rulesMet";
}

export interface EtfScoreFacts {
  asOf: string;
  instrumentType: string;
  name: string;
  riskType?: string | null;
  detailStatus: string | null;
  lastSeen: string;
  terPct: number | null;
  aumEur: number | null;
  aumCurrencyReason?: string | null;
  medianValueTradedEur: number | null;
  replication: string | null;
  ucitsConfirmed: boolean | null;
  inceptionDate: string | null;
  domicile: string | null;
  assetClass: string | null;
  usEquityWeightPct: number | null;
  barsCount: number;
  close: number | null;
  sma50: number | null;
  sma200: number | null;
  return12to1m: number | null;
  maxDrawdown1y: number | null;
  topTenWeightPct: number | null;
  maxCountryWeightPct: number | null;
  maxSectorWeightPct: number | null;
  holdingsCount: number | null;
}
export interface EtfRuleHit { id: string; group: "cost" | "size" | "structure" | "trend"; max: number; earned: number; evidenced: boolean; reason?: string }
export interface EtfScoreResult {
  rulesVersion: string; rules: EtfRuleHit[]; earned: number; evidencedMax: number; percent: number | null;
  state: "rated" | "not_rated"; rejections: string[];
  concentration: { topTenWeightPct: number | null; maxCountryWeightPct: number | null; maxSectorWeightPct: number | null; holdingsCount: number | null; concentrated: boolean };
}
const known = (n: number | null): n is number => n !== null && Number.isFinite(n);
const days = (end: string, start: string) => (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
const years = (end: string, start: string) => Number(end.slice(0, 4)) - Number(start.slice(0, 4)) - (end.slice(5) < start.slice(5) ? 1 : 0);

export function etfScore(f: EtfScoreFacts): EtfScoreResult {
  const rules: EtfRuleHit[] = [];
  const add = (id: string, group: EtfRuleHit["group"], max: number, earned: number | null) => rules.push({ id, group, max, earned: earned ?? 0, evidenced: earned !== null });
  add("ter", "cost", 10, known(f.terPct) && f.terPct > 0 ? B.ter.find(([limit]) => f.terPct! <= limit)?.[1] ?? 0 : null);
  add("aum", "size", 6, known(f.aumEur) && f.aumEur > 0 ? B.aum.find(([min]) => f.aumEur! >= min)?.[1] ?? 0 : null);
  if (!rules.at(-1)!.evidenced) rules.at(-1)!.reason = f.aumCurrencyReason ?? "missing_aum";
  else if (f.aumEur! < 50_000_000) rules.at(-1)!.reason = "aum_under_50m_eur";
  add("liquidity", "size", 4, known(f.medianValueTradedEur) && f.medianValueTradedEur > 0 ? B.liquidity.find(([min]) => f.medianValueTradedEur! >= min)?.[1] ?? 0 : null);
  const replication = normalizeReplication(f.replication);
  add("replication", "structure", 3, replication === "full" ? 3 : replication === "sampling" || replication === "fund_of_funds" ? 2 : replication === "synthetic" ? 1 : replication === "overlay" ? 0 : null);
  add("ucits", "structure", 3, f.ucitsConfirmed === null ? null : f.ucitsConfirmed ? 3 : 0);
  const age = f.inceptionDate ? years(f.asOf, f.inceptionDate) : null;
  add("age", "structure", 3, age === null || !Number.isFinite(age) || age < 0 ? null : B.age.find(([min]) => age >= min)?.[1] ?? 0);
  const domicileEvidence = f.assetClass === "equity" && f.usEquityWeightPct === null ? null : f.domicile;
  add("domicile", "structure", 1, domicileEvidence === null ? null : f.assetClass === "equity" && (f.usEquityWeightPct ?? 0) > 50 ? /^IE$/i.test(f.domicile ?? "") ? 1 : 0 : 1);
  const hasTrend = f.barsCount >= 200;
  add("sma200", "trend", 2, hasTrend && known(f.close) && known(f.sma200) && f.sma200 > 0 ? f.close > f.sma200 * (1 + B.smaBand) ? 2 : 0 : null);
  add("sma50", "trend", 1, hasTrend && known(f.sma50) && known(f.sma200) ? f.sma50 > f.sma200 ? 1 : 0 : null);
  add("return12to1m", "trend", 1, hasTrend && known(f.return12to1m) ? f.return12to1m > 0 ? 1 : 0 : null);
  add("drawdown1y", "trend", 1, hasTrend && f.assetClass === "equity" && known(f.maxDrawdown1y) ? f.maxDrawdown1y > B.maxEquityDrawdown ? 1 : 0 : null);
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
  const cost = rules.some((rule) => rule.id === "ter" && rule.evidenced);
  const other = rules.some((rule) => rule.evidenced && (rule.id === "aum" || rule.id === "liquidity" || rule.id === "age" || rule.group === "trend"));
  if (!cost || !other) rejections.push("insufficient_evidence");
  const state = rejections.length ? "not_rated" : "rated";
  return { rulesVersion: ETF_RULES_VERSION, rules, earned, evidencedMax, percent: state === "rated" ? Math.round(earned / evidencedMax * 100) : null, state, rejections,
    concentration: { topTenWeightPct: f.topTenWeightPct, maxCountryWeightPct: f.maxCountryWeightPct, maxSectorWeightPct: f.maxSectorWeightPct, holdingsCount: f.holdingsCount,
      concentrated: (f.topTenWeightPct ?? 0) > B.topTenConcentration || (f.maxCountryWeightPct ?? 0) > B.countryConcentration } };
}
