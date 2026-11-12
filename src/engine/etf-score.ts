import { ETF_MIN_EVIDENCED, ETF_RULES_VERSION, ETF_SCORE_BANDS as B } from "./etf-score-config";

export interface EtfScoreFacts {
  asOf: string;
  instrumentType: string;
  name: string;
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
  add("ter", "cost", 10, known(f.terPct) && f.terPct >= 0 ? B.ter.find(([limit]) => f.terPct! <= limit)?.[1] ?? 0 : null);
  add("aum", "size", 6, known(f.aumEur) && f.aumEur >= 0 ? B.aum.find(([min]) => f.aumEur! >= min)?.[1] ?? 0 : null);
  if (!rules.at(-1)!.evidenced) rules.at(-1)!.reason = f.aumCurrencyReason ?? "missing_aum";
  add("liquidity", "size", 4, known(f.medianValueTradedEur) && f.medianValueTradedEur >= 0 ? B.liquidity.find(([min]) => f.medianValueTradedEur! >= min)?.[1] ?? 0 : null);
  const replication = f.replication?.toLowerCase().trim();
  add("replication", "structure", 3, !replication ? null : /full|physical/.test(replication) && !/sampl/.test(replication) ? 3 : /sampl/.test(replication) ? 2 : /swap|synthetic/.test(replication) ? 1 : 0);
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
  if (/leveraged|inverse|daily[ -]?reset|[23]x\b/i.test(f.name)) rejections.push("leveraged_inverse_daily_reset");
  if (f.instrumentType === "ETC" || f.instrumentType === "ETN") rejections.push("not_etf_instrument");
  if (age !== null && age >= 0 && age < 1) rejections.push("age_under_one_year");
  if (known(f.aumEur) && f.aumEur < 20_000_000) rejections.push("aum_under_20m_eur");
  if (f.detailStatus === "isin_mismatch" || f.detailStatus === "not_etf") rejections.push(f.detailStatus);
  if (days(f.asOf, f.lastSeen) > 30) rejections.push("stale_listing");
  const earned = rules.reduce((sum, rule) => sum + rule.earned, 0);
  const evidencedMax = rules.reduce((sum, rule) => sum + (rule.evidenced ? rule.max : 0), 0);
  if (evidencedMax < ETF_MIN_EVIDENCED) rejections.push("insufficient_evidence");
  const state = rejections.length ? "not_rated" : "rated";
  return { rulesVersion: ETF_RULES_VERSION, rules, earned, evidencedMax, percent: state === "rated" ? Math.round(earned / evidencedMax * 100) : null, state, rejections,
    concentration: { topTenWeightPct: f.topTenWeightPct, maxCountryWeightPct: f.maxCountryWeightPct, maxSectorWeightPct: f.maxSectorWeightPct, holdingsCount: f.holdingsCount,
      concentrated: (f.topTenWeightPct ?? 0) > B.topTenConcentration || (f.maxCountryWeightPct ?? 0) > B.countryConcentration } };
}
