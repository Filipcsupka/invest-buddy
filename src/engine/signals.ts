import type { Technicals } from "../data/technicals";

/**
 * Deterministic trade signals. Code decides the action, the amount band and the three ratings; the AI judge only explains them.
 * Pure: the same input gives the same output, whatever the order of the symbols. No clock, no randomness, no I/O.
 * Profit and loss on a position is never an input, so a falling price below cost cannot produce an add.
 *
 * Rules, in order, for each symbol (thresholds live in SIGNAL_RULES):
 *  1. No portfolio baseline: WATCH EUR 0 for everything, because cash is unknown.
 *  2. Rejection (revenue declining, guidance cut, or the rule engine's "Criteria broken"): THESIS_BROKEN for a held name, WATCH EUR 0 otherwise.
 *  3. Held, company rating Weak and a downtrend: REDUCE by a share of the position.
 *  4. Fewer than two confirmed key fields: WATCH EUR 0, insufficient evidence.
 *  5. Buy conditions: rule score at least 15, company and entry at least Good, no downtrend.
 *     CONVICTION (score 18 or more, company, entry and catalyst at least Strong, a fresh confirmed EPS beat or guidance raise):
 *       held name: HIGH_CONVICTION_ADD. New name: START_POSITION, because a starter comes first and may stay small for months.
 *     Held name without conviction: ADD when entry is at least Strong or in a pullback, else HOLD.
 *     New name: START_POSITION.
 *  6. Amounts are shares of available cash, rounded to whole euros, capped by the position limit and by the total deploy limit.
 *     A band under the minimum becomes WATCH EUR 0. Cash stays uninvested when nothing qualifies.
 *  7. CSPX_ALLOCATION only when no single-name buy was produced and cash is above the minimum.
 */
export const SIGNAL_RULES = {
  version: "2026-10-05.1",
  actionsOrder: ["HIGH_CONVICTION_ADD", "ADD", "START_POSITION"],
  minScoreForBuy: 15,
  convictionScore: 18,
  minConfirmedKeyFields: 2,
  keyFields: ["revenueAccelerating", "revenueDeclining", "epsBeat", "guidanceRaised", "guidanceCut", "productCatalyst"],
  companyPoints: {
    revenueAccelerating: { true: 2 }, revenueDeclining: { true: -4, false: 1 }, epsBeat: { true: 1 }, guidanceRaised: { true: 1 },
    guidanceCut: { true: -4 }, narrativeChanged: { true: -2 }, insiderOrInstitutionalBuying: { true: 1 },
  } as Record<string, { true?: number; false?: number }>,
  /** A rating from points: the first threshold met, else Weak. */
  companyThresholds: { "Very strong": 5, Strong: 3, Good: 2, Neutral: 0 },
  catalystPoints: { productCatalyst: 3, productCatalystCarried: 1, epsBeat: 1, guidanceRaised: 1, insiderOrInstitutionalBuying: 1, narrativeChangedTrue: -2 },
  catalystThresholds: { "Very strong": 4, Strong: 3, Good: 2, Neutral: 0 },
  entryPoints: { pullback: 3, breakout: 3, uptrend: 2, deepPullback: 1, range: 0, downtrend: -3, rsiHealthyMin: 40, rsiHealthyMax: 60, rsiHealthy: 1, rsiExtended: 75, rsiExtendedPenalty: -2, rsiOversold: 30, rsiOversoldPenalty: -1, extendedAboveMa50Percent: 15, extendedPenalty: -2, relativeStrength20: 1, relativeStrength60: 1, breakoutBelowHighPercent: 1, breakoutVolumeRatio: 1.2 },
  entryThresholds: { "Very strong": 5, Strong: 3, Good: 1, Neutral: 0 },
  /** Shares of available cash, [min, max], in percent. */
  bands: { START_POSITION: [5, 10], ADD: [8, 15], HIGH_CONVICTION_ADD: [15, 30], CSPX_ALLOCATION: [10, 20] } as Record<string, [number, number]>,
  reducePercentOfPosition: [25, 50] as [number, number],
  minBuyEur: 20,
  maxPositionPercentOfInvested: 25,
  maxDeployPercentOfCash: 60,
  cspxMinCashEur: 100,
  cspxMaxPercentOfInvested: 80,
  cspxSymbol: "CSPX",
} as const;
export type SignalRules = typeof SIGNAL_RULES;

export const ACTIONS = ["WATCH", "START_POSITION", "ADD", "HIGH_CONVICTION_ADD", "HOLD", "REDUCE", "THESIS_BROKEN", "CSPX_ALLOCATION"] as const;
export type SignalAction = (typeof ACTIONS)[number];
export type SignalRating = "Very strong" | "Strong" | "Good" | "Neutral" | "Weak";
const ORDER: SignalRating[] = ["Weak", "Neutral", "Good", "Strong", "Very strong"];
const atLeast = (r: SignalRating, min: SignalRating) => ORDER.indexOf(r) >= ORDER.indexOf(min);

export interface SignalField { value: boolean | null; agreement: string; verified: boolean; carriedFrom: string | null }
export interface SignalSymbolInput {
  symbol: string;
  held: { valueEur: number } | null;
  score: { total: number; state: string };
  fields: Record<string, SignalField>;
  expiredFields: string[];
  technicals: Technicals | null;
}
export interface SignalPortfolio { cashEur: number; investedEur: number; positions: { symbol: string; valueEur: number }[]; monthlyContributionEur?: number | null }
export interface Signal {
  symbol: string;
  action: SignalAction;
  amountMinEur: number;
  amountMaxEur: number;
  ratings: { company: SignalRating; entry: SignalRating; catalyst: SignalRating };
  points: { company: number; entry: number; catalyst: number };
  unconfirmed: boolean;
  carriedFrom: string | null;
  confirmedFields: string[];
  reasons: string[];
  ruleConfigVersion: string;
}

const rate = (points: number, thresholds: Record<string, number>): SignalRating => {
  for (const name of ["Very strong", "Strong", "Good", "Neutral"] as const) if (points >= thresholds[name]) return name;
  return "Weak";
};
const cap = (r: SignalRating, max: SignalRating): SignalRating => (atLeast(r, max) ? max : r);

/** A field counts only when two agents agreed or SEC data confirmed it, the quote was verified, and it has not expired. Returns its value, or null when it does not count. */
export function confirmed(input: SignalSymbolInput, name: string): boolean | null {
  const f = input.fields[name];
  if (!f || f.value === null || !f.verified || !(f.agreement === "agree" || f.agreement === "xbrl_override") || input.expiredFields.includes(name)) return null;
  return f.value;
}

export function ratings(input: SignalSymbolInput, rules: SignalRules = SIGNAL_RULES) {
  const carried = (name: string) => Boolean(input.fields[name]?.carriedFrom);
  let company = 0, catalyst = 0, carriedPositive = false;
  for (const [name, table] of Object.entries(rules.companyPoints)) {
    const v = confirmed(input, name);
    if (v === null) continue;
    const p = table[v ? "true" : "false"] ?? 0;
    company += p;
    if (p > 0 && carried(name)) carriedPositive = true;
  }
  const cp = rules.catalystPoints;
  if (confirmed(input, "productCatalyst") === true) catalyst += carried("productCatalyst") ? cp.productCatalystCarried : cp.productCatalyst;
  for (const name of ["epsBeat", "guidanceRaised", "insiderOrInstitutionalBuying"] as const) if (confirmed(input, name) === true && !carried(name)) catalyst += cp[name];
  if (confirmed(input, "narrativeChanged") === true) catalyst += cp.narrativeChangedTrue;
  let companyRating = rate(company, rules.companyThresholds);
  if (carriedPositive) companyRating = cap(companyRating, "Good");

  let entry = 0;
  const t = input.technicals, e = rules.entryPoints;
  if (t) {
    const breakout = t.regime === "uptrend" && t.belowHigh20Percent !== null && t.belowHigh20Percent <= e.breakoutBelowHighPercent && (t.volumeRatio ?? 0) >= e.breakoutVolumeRatio;
    entry += t.regime === "pullback" ? e.pullback : breakout ? e.breakout : t.regime === "uptrend" ? e.uptrend : t.regime === "deep_pullback" ? e.deepPullback : t.regime === "downtrend" ? e.downtrend : e.range;
    if (t.rsi14 !== null) entry += t.rsi14 > e.rsiExtended ? e.rsiExtendedPenalty : t.rsi14 < e.rsiOversold ? e.rsiOversoldPenalty : t.rsi14 >= e.rsiHealthyMin && t.rsi14 <= e.rsiHealthyMax ? e.rsiHealthy : 0;
    if (t.vsMa50Percent !== null && t.vsMa50Percent > e.extendedAboveMa50Percent) entry += e.extendedPenalty;
    if (t.relativeStrength20 !== null && t.relativeStrength20 > 0) entry += e.relativeStrength20;
    if (t.relativeStrength60 !== null && t.relativeStrength60 > 0) entry += e.relativeStrength60;
  }
  return {
    ratings: { company: companyRating, entry: t ? rate(entry, rules.entryThresholds) : ("Neutral" as SignalRating), catalyst: rate(catalyst, rules.catalystThresholds) },
    points: { company, entry, catalyst },
  };
}

const band = (cash: number, [lo, hi]: [number, number]) => [Math.round((cash * lo) / 100), Math.round((cash * hi) / 100)] as [number, number];
const rank = (s: Signal) => SIGNAL_RULES.actionsOrder.indexOf(s.action as never);

/** One signal per symbol, sorted by symbol. */
export function computeSignals(symbols: SignalSymbolInput[], portfolio: SignalPortfolio | null, rules: SignalRules = SIGNAL_RULES): Signal[] {
  const sorted = [...symbols].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const cash = portfolio?.cashEur ?? 0;
  const invested = portfolio?.investedEur ?? 0;
  const out = new Map<string, Signal>();
  const candidates: { sig: Signal; held: number; total: number }[] = [];

  for (const s of sorted) {
    const r = ratings(s, rules);
    const keyConfirmed = rules.keyFields.filter((k) => confirmed(s, k) !== null);
    const carriedDates = Object.values(s.fields).map((f) => f.carriedFrom).filter((d): d is string => !!d).sort();
    const sig: Signal = {
      symbol: s.symbol, action: "WATCH", amountMinEur: 0, amountMaxEur: 0, ratings: r.ratings, points: r.points,
      unconfirmed: keyConfirmed.length < rules.minConfirmedKeyFields || rules.keyFields.some((k) => confirmed(s, k) !== null && s.fields[k]?.carriedFrom),
      carriedFrom: carriedDates[0] ?? null, confirmedFields: keyConfirmed, reasons: [], ruleConfigVersion: rules.version,
    };
    out.set(s.symbol, sig);
    const held = s.held?.valueEur ?? 0;
    const regime = s.technicals?.regime ?? null;
    if (!portfolio) { sig.reasons.push("No portfolio baseline, so cash is unknown."); continue; }
    const rejected = confirmed(s, "revenueDeclining") === true || confirmed(s, "guidanceCut") === true || s.score.state === "Criteria broken";
    if (rejected) {
      sig.reasons.push("A rejection rule applies: revenue declining, guidance cut or criteria broken.");
      if (s.held) sig.action = "THESIS_BROKEN";
      continue;
    }
    if (s.held && r.ratings.company === "Weak" && regime === "downtrend") {
      const [lo, hi] = rules.reducePercentOfPosition;
      sig.action = "REDUCE"; sig.amountMinEur = Math.round((held * lo) / 100); sig.amountMaxEur = Math.round((held * hi) / 100);
      sig.reasons.push("Company rating is Weak and the price is in a downtrend.");
      continue;
    }
    if (keyConfirmed.length < rules.minConfirmedKeyFields) { sig.reasons.push(`Insufficient evidence: ${keyConfirmed.length} confirmed key fields, ${rules.minConfirmedKeyFields} needed.`); continue; }
    const buyable = s.score.total >= rules.minScoreForBuy && atLeast(r.ratings.company, "Good") && atLeast(r.ratings.entry, "Good") && regime !== "downtrend";
    if (!buyable) { sig.reasons.push("Buy conditions are not met."); if (s.held) sig.action = "HOLD"; continue; }
    const execution = confirmed(s, "epsBeat") === true || confirmed(s, "guidanceRaised") === true;
    const conviction = s.score.total >= rules.convictionScore && atLeast(r.ratings.company, "Strong") && atLeast(r.ratings.entry, "Strong") && atLeast(r.ratings.catalyst, "Strong") && execution && !sig.carriedFrom;
    if (!s.held) { sig.action = "START_POSITION"; sig.reasons.push(conviction ? "Conviction conditions met; a new name starts with a starter." : "Buy conditions met; starter position."); }
    else if (conviction) { sig.action = "HIGH_CONVICTION_ADD"; sig.reasons.push("Conviction conditions met."); }
    else if (atLeast(r.ratings.entry, "Strong") || regime === "pullback") { sig.action = "ADD"; sig.reasons.push("Fundamentals hold and the entry is good."); }
    else { sig.action = "HOLD"; sig.reasons.push("Held; no better entry."); continue; }
    candidates.push({ sig, held, total: s.score.total });
  }

  // Allocate cash to buys in priority order.
  let deployed = 0;
  const deployCap = (cash * rules.maxDeployPercentOfCash) / 100;
  candidates.sort((a, b) => rank(a.sig) - rank(b.sig) || b.total - a.total || a.sig.symbol.localeCompare(b.sig.symbol));
  for (const { sig, held } of candidates) {
    let [lo, hi] = band(cash, rules.bands[sig.action]);
    if (held > 0 && invested > 0) {
      const share = rules.maxPositionPercentOfInvested / 100;
      const room = Math.floor((share * invested - held) / (1 - share));
      if (room < hi) { hi = Math.max(room, 0); lo = Math.min(lo, hi); sig.reasons.push(`Position limit of ${rules.maxPositionPercentOfInvested} percent of invested capital.`); }
    }
    if (deployed + hi > deployCap) { hi = Math.max(Math.floor(deployCap - deployed), 0); lo = Math.min(lo, hi); sig.reasons.push(`Deploy limit of ${rules.maxDeployPercentOfCash} percent of cash.`); }
    if (hi < rules.minBuyEur) { sig.reasons.push(`Band under the EUR ${rules.minBuyEur} minimum.`); sig.action = "WATCH"; continue; }
    lo = Math.max(lo, rules.minBuyEur);
    sig.amountMinEur = lo; sig.amountMaxEur = hi; deployed += hi;
  }

  // CSPX only when nothing else was bought and cash is idle.
  const bought = [...out.values()].some((s) => s.amountMaxEur > 0 && s.action !== "REDUCE");
  const cspxValue = portfolio?.positions.find((p) => p.symbol === rules.cspxSymbol)?.valueEur ?? 0;
  if (portfolio && !bought && cash >= rules.cspxMinCashEur && !out.has(rules.cspxSymbol) && (invested <= 0 || (cspxValue / invested) * 100 < rules.cspxMaxPercentOfInvested)) {
    const [lo, hi] = band(cash, rules.bands.CSPX_ALLOCATION);
    if (hi >= rules.minBuyEur) out.set(rules.cspxSymbol, {
      symbol: rules.cspxSymbol, action: "CSPX_ALLOCATION", amountMinEur: Math.max(lo, rules.minBuyEur), amountMaxEur: hi,
      ratings: { company: "Good", entry: "Neutral", catalyst: "Neutral" }, points: { company: 0, entry: 0, catalyst: 0 }, unconfirmed: false, carriedFrom: null, confirmedFields: [],
      reasons: ["No single-name buy qualifies and cash is idle; the broad index is the default."], ruleConfigVersion: rules.version,
    });
  }
  return [...out.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
